"""
FastAPI microservice for tree crown detection.

POST /detect  — accepts a GeoTIFF (3-band NGR or 4-band RGBN), returns:
  { "tree_count": int, "plot": "<base64 PNG>" }

The DeepTrees model is loaded once at startup and reused for every request.
For images larger than TILE_THRESHOLD pixels in either dimension the raster is
automatically split into overlapping tiles; the resulting polygons are merged
before the response is built.  For smaller images the full raster is processed
in one shot (the model handles its own 256-px sliding window internally).
"""

import asyncio
import base64
import io
import logging
import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import rasterio
from rasterio.windows import Window
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Must be set before importing deeptrees so that relative paths in the config
# (pretrained_model_path, polygon_file, etc.) resolve correctly.
MODEL_DIR = Path(__file__).resolve().parent
os.chdir(MODEL_DIR)

import torch
from omegaconf import OmegaConf
from deeptrees.pretrained import freudenberg2022
from deeptrees.model.deeptrees_model import DeepTreesModel
from deeptrees.dataloading.datasets import TreeCrownDelineationInferenceDataset
from deeptrees.modules import utils as dt_utils
from deeptrees.modules import postprocessing as tcdpp

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CONFIG_PATH = MODEL_DIR / "tree_conf.yaml"

# Images larger than this in either dimension are tiled before inference to
# avoid loading the full raster into memory at once.
TILE_THRESHOLD = 2000
TILE_SIZE = 1024
TILE_OVERLAP = 128

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tree_api")

# ---------------------------------------------------------------------------
# Global model state (initialised once in lifespan)
# ---------------------------------------------------------------------------
_model: DeepTreesModel | None = None
_cfg = None
_device: torch.device | None = None
_predict_lock = asyncio.Lock()


def _load_model() -> None:
    global _model, _cfg, _device

    _cfg = OmegaConf.load(CONFIG_PATH)

    pretrained_path = Path(_cfg.pretrained_model_path) / _cfg.pretrained_model_name
    if not pretrained_path.exists():
        log.info("Pretrained model not found locally — downloading …")
        pretrained_path.parent.mkdir(parents=True, exist_ok=True)
        freudenberg2022(str(pretrained_path))

    model = DeepTreesModel(
        num_backbones=_cfg.model.num_backbones,
        in_channels=_cfg.model.in_channels,
        architecture=_cfg.model.architecture,
        backbone=_cfg.model.backbone,
        apply_sigmoid=_cfg.model.apply_sigmoid,
        postprocessing_config=_cfg.polygon_extraction,
    )

    log.info("Loading weights from %s", pretrained_path)
    try:
        jit = torch.jit.load(str(pretrained_path), map_location="cpu")
        model.tcd_backbone.load_state_dict(jit.state_dict())
    except Exception as e:
        log.warning("JIT load failed (%s) — trying torch.load", e)
        state_dict = torch.load(str(pretrained_path), map_location="cpu")
        if hasattr(state_dict, "state_dict"):
            state_dict = state_dict.state_dict()
        try:
            model.load_state_dict(state_dict)
        except Exception:
            model.tcd_backbone.load_state_dict(state_dict)

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _model = model.to(_device)
    _model.eval()
    log.info("Model ready on %s", _device)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_model()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Tree Detection API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _remap_ngr_to_rgbn(src_path: str, dst_path: str) -> None:
    """Remap 3-band NGR (NIR, Green, Red) to 4-band RGBN expected by the model.

    If the raster already has 4+ bands it is copied as-is.
    """
    with rasterio.open(src_path) as src:
        if src.count >= 4:
            shutil.copy(src_path, dst_path)
            return
        if src.count < 3:
            raise ValueError(f"Expected at least 3 bands, got {src.count}")
        nir   = src.read(1)
        green = src.read(2)
        red   = src.read(3)
        blue  = np.zeros_like(red, dtype=red.dtype)
        profile = src.profile.copy()

    profile.update(count=4, photometric="MINISBLACK", compress="deflate", predictor=2)
    with rasterio.open(dst_path, "w", **profile) as dst:
        dst.write(red,   1)
        dst.write(green, 2)
        dst.write(blue,  3)
        dst.write(nir,   4)


def _tile_raster(src_path: str, out_dir: str, prefix: str) -> list[str]:
    """Split a large raster into overlapping tiles. Returns sorted tile paths."""
    step = TILE_SIZE - TILE_OVERLAP
    paths = []
    with rasterio.open(src_path) as src:
        profile = src.profile.copy()
        W, H = src.width, src.height
        for row in range(0, H, step):
            for col in range(0, W, step):
                win_w = min(TILE_SIZE, W - col)
                win_h = min(TILE_SIZE, H - row)
                if win_w < 64 or win_h < 64:
                    continue
                win = Window(col, row, win_w, win_h)
                profile.update(
                    width=win_w,
                    height=win_h,
                    transform=src.window_transform(win),
                )
                tile_path = os.path.join(out_dir, f"{prefix}_{row:05d}_{col:05d}.tif")
                with rasterio.open(tile_path, "w", **profile) as dst:
                    dst.write(src.read(window=win))
                paths.append(tile_path)
    log.info("Tiled %dx%d image into %d tiles", W, H, len(paths))
    return paths


def _predict_sync(image_paths: list[str]) -> list[str]:
    """Run inference on a list of raster paths; return shapefile paths produced."""
    gci_config = getattr(_cfg.data, "gci_config", {"concatenate": False})
    hue_config = getattr(_cfg.data, "hue_config", {"concatenate": False})

    dataset = TreeCrownDelineationInferenceDataset(
        raster_files=image_paths,
        augmentation=_cfg.data.augment_eval,
        ndvi_config=_cfg.data.ndvi_config,
        gci_config=gci_config,
        hue_config=hue_config,
        dilate_outlines=_cfg.data.dilate_outlines,
        in_memory=False,
        divide_by=_cfg.data.divide_by,
    )

    Path("./saved_polygons").mkdir(exist_ok=True)
    shp_paths: list[str] = []

    for batch in dataset:
        raster, raster_dict = batch
        trafo       = raster_dict["trafo"]
        raster_name = raster_dict["raster_id"]

        raster = raster.unsqueeze(0).to(_device)
        with torch.no_grad():
            output = dt_utils.predict_on_tile(_model, raster)

        mask     = output[:, 0].cpu().numpy().squeeze()
        outline  = output[:, 1].cpu().numpy().squeeze()
        dist     = output[:, 2].cpu().numpy().squeeze()

        polygons = tcdpp.extract_polygons(
            mask, outline, dist,
            transform=trafo,
            mask_exp=_cfg.polygon_extraction.mask_exp,
            outline_multiplier=_cfg.polygon_extraction.outline_multiplier,
            outline_exp=_cfg.polygon_extraction.outline_exp,
            dist_exp=_cfg.polygon_extraction.dist_exp,
            sigma=_cfg.polygon_extraction.sigma,
            binary_threshold=_cfg.polygon_extraction.binary_threshold,
            min_dist=_cfg.polygon_extraction.min_dist,
            label_threshold=_cfg.polygon_extraction.label_threshold,
            area_min=_cfg.polygon_extraction.area_min,
            simplify=_cfg.polygon_extraction.simplify,
        )
        log.info("%s → %d polygons", Path(raster_name).name, len(polygons))

        with rasterio.open(raster_name) as src:
            source_crs = src.crs

        poly_path = str(
            Path(os.getcwd()) / "saved_polygons" / (Path(raster_name).stem + ".shp")
        )
        dt_utils.save_polygons(polygons, poly_path, crs=source_crs)
        if Path(poly_path).exists():
            shp_paths.append(poly_path)

    return shp_paths


def _cleanup_shapefiles(shp_paths: list[str]) -> None:
    for shp in shp_paths:
        stem = Path(shp).stem
        parent = Path(shp).parent
        for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
            try:
                (parent / (stem + ext)).unlink(missing_ok=True)
            except OSError:
                pass


def _build_response(shp_paths: list[str]) -> dict:
    gdfs = [gpd.read_file(p) for p in shp_paths]
    merged = gpd.GeoDataFrame(pd.concat(gdfs, ignore_index=True), crs=gdfs[0].crs)
    tree_count = len(merged)

    fig, ax = plt.subplots(figsize=(10, 10))
    if tree_count > 0:
        merged.plot(ax=ax, edgecolor="black", facecolor="lightgreen", alpha=0.6)
    ax.set_title(f"Tree Crowns — {tree_count} detected", fontsize=14)
    ax.axis("off")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150)
    plt.close(fig)
    buf.seek(0)
    plot_b64 = base64.b64encode(buf.read()).decode()

    return {"tree_count": tree_count, "plot": plot_b64}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}


@app.post("/detect")
async def detect_trees(file: UploadFile = File(...)):
    """
    Detect tree crowns in a GeoTIFF.

    - **file**: GeoTIFF with 3 bands (NIR, Green, Red) or 4 bands (R, G, B, NIR).

    Returns JSON:
    ```json
    {
      "tree_count": 42,
      "plot": "<base64-encoded PNG>"
    }
    ```
    """
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="Only GeoTIFF files (.tif / .tiff) are accepted.")

    req_id = uuid.uuid4().hex
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"tree_{req_id}_"))
    shp_paths: list[str] = []

    try:
        raw_path      = str(tmp_dir / "input.tif")
        remapped_path = str(tmp_dir / "remapped.tif")

        with open(raw_path, "wb") as f:
            f.write(await file.read())

        _remap_ngr_to_rgbn(raw_path, remapped_path)

        with rasterio.open(remapped_path) as src:
            W, H = src.width, src.height

        if W > TILE_THRESHOLD or H > TILE_THRESHOLD:
            tiles_dir = tmp_dir / "tiles"
            tiles_dir.mkdir()
            image_paths = _tile_raster(remapped_path, str(tiles_dir), req_id)
        else:
            # Give the file a unique name so the output shapefile doesn't
            # collide with concurrent requests writing to ./saved_polygons/.
            unique_path = str(tmp_dir / f"{req_id}.tif")
            shutil.copy(remapped_path, unique_path)
            image_paths = [unique_path]

        # Prediction writes to ./saved_polygons/ which is shared; serialise.
        async with _predict_lock:
            loop = asyncio.get_event_loop()
            shp_paths = await loop.run_in_executor(None, _predict_sync, image_paths)

        if not shp_paths:
            return JSONResponse({"tree_count": 0, "plot": None})

        return JSONResponse(_build_response(shp_paths))

    except HTTPException:
        raise
    except Exception as e:
        log.exception("Detection failed for request %s", req_id)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        _cleanup_shapefiles(shp_paths)
