import { Injectable } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';
import { Observable, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { load as cheerioLoad } from 'cheerio';
import * as unzipper from 'unzipper';

export interface SseEvent {
  data: string;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CadastreInfo {
  code: string;
  address: string;
  area: number;
  bbox: BBox;
  coordinates: number[][][];
}

export interface ForestHeightStats {
  averageHeight: number;
  forestPixelCount: number;
  totalPixelCount: number;
  shares: { threshold: number; percentage: number }[];
}

export interface ResourceFeature {
  type: string;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: Record<string, string | number | null>;
}

export interface ResourceData {
  type: string;
  features: ResourceFeature[];
}

export interface AnalysisResult {
  info: CadastreInfo;
  originalImage: string;
  clippedImage: string;
  tifFiles: string[];
  cirFile?: string;
  heightStats?: ForestHeightStats;
  resourceFile?: string;   // filename under output/resources/ — fetched separately by frontend
  resourceCount?: number;  // 0 = no resources found
  treeCount?: number;
  treePolygonPlot?: string;
}

interface WorldFile {
  pixelSizeX: number;
  pixelSizeY: number;
  originX: number;
  originY: number;
}


const CADASTRE_API =
  'https://kolvikud.kataster.ee/api/cadastre-unit/find?date=2024-02-01&code=';
const WMS_BASE =
  'https://kaart.maaamet.ee/wms/alus?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&FORMAT=image%2Fjpeg&STYLES=&TRANSPARENT=TRUE&LAYERS=cir_ngr&SRS=EPSG%3A3301';
const KAARDILEHT_WFS = 'https://xgis.maaamet.ee/xgis2/service/1kk6m14';
const GEOPORTAL_SEARCH =
  'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=610&andmetyyp=ortofoto_eesti_ngr';
const GEOPORTAL_CHM_SEARCH =
  'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=614&andmetyyp=chm_geotiff';
const MAARDLAD_EXPORT = 'https://xgis.maaamet.ee/xgis2/export';
const GEOPORTAL_BASE = 'https://geoportaal.maaamet.ee';
const MAX_IMG_PX = 800;
const PADDING_RATIO = 0.05;
const OUTPUT_DIR = path.join(process.cwd(), 'output');

function emit(subject: Subject<SseEvent>, step: string, message: string, payload?: unknown) {
  const obj: Record<string, unknown> = { step, message };
  if (payload !== undefined) obj.payload = payload;
  subject.next({ data: JSON.stringify(obj) });
}

@Injectable()
export class CadastreService {
  analyze(code: string): Observable<SseEvent> {
    const subject = new Subject<SseEvent>();
    this.run(code, subject).catch((err: Error) => {
      emit(subject, 'error', err.message ?? 'Tundmatu viga');
      subject.complete();
    });
    return subject.asObservable();
  }

  private async run(code: string, subject: Subject<SseEvent>): Promise<void> {
    // Step 1 – fetch cadastre
    emit(subject, 'fetching', 'Laen katastriandmeid...');
    const cadastreUrl = `${CADASTRE_API}${encodeURIComponent(code)}`;
    const cadastreRes = await axios.get<CadastreApiItem[]>(cadastreUrl, { timeout: 15000 })
      .catch(err => { throw new Error(`Kataster API (${cadastreUrl}): ${err.message}`); });

    const items = cadastreRes.data;
    if (!items?.length) throw new Error(`Katastriüksust ei leitud: ${code}`);

    const item = items[0];
    const geomParsed = JSON.parse(item.geometry) as { type: string; coordinates: unknown };
    if (!geomParsed || geomParsed.type !== 'Polygon') {
      throw new Error('Katastriüksuse geomeetria pole Polygon');
    }

    const polygon: number[][][] = geomParsed.coordinates as number[][][];
    const ring = polygon[0];

    // Step 2 – calculate bbox
    emit(subject, 'bbox', 'Arvutan piirikasti...');
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    const padX = (Math.max(...xs) - Math.min(...xs)) * PADDING_RATIO;
    const padY = (Math.max(...ys) - Math.min(...ys)) * PADDING_RATIO;
    const bbox: BBox = {
      minX: Math.min(...xs) - padX,
      maxX: Math.max(...xs) + padX,
      minY: Math.min(...ys) - padY,
      maxY: Math.max(...ys) + padY,
    };

    // Step 3 – download WMS image for display
    emit(subject, 'downloading', 'Laen aerofotot...');
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    const scale = MAX_IMG_PX / Math.max(bboxW, bboxH);
    const imgW = Math.round(bboxW * scale);
    const imgH = Math.round(bboxH * scale);

    const wmsUrl =
      `${WMS_BASE}&WIDTH=${imgW}&HEIGHT=${imgH}` +
      `&BBOX=${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`;

    const wmsRes = await axios.get<ArrayBuffer>(wmsUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    }).catch(err => { throw new Error(`WMS (${wmsUrl}): ${err.message}`); });
    const wmsBuffer = Buffer.from(wmsRes.data);

    // Step 4 – clip WMS image to polygon
    emit(subject, 'clipping', 'Lõikan katastriüksust...');
    const toPixelWms = (c: number[]): [number, number] => [
      Math.round(((c[0] - bbox.minX) / bboxW) * imgW),
      Math.round(((bbox.maxY - c[1]) / bboxH) * imgH),
    ];
    const wmsPoints = ring
      .map(toPixelWms)
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    const wmsSvgMask = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
      <polygon points="${wmsPoints}" fill="white"/>
    </svg>`;
    const wmsClippedBuffer = await sharp(wmsBuffer)
      .png()
      .composite([{ input: Buffer.from(wmsSvgMask), blend: 'dest-in' }])
      .toBuffer();

    // Step 5 – find kaardilehts and download TIFs
    emit(subject, 'kaardileht', 'Otsin kaardilehti...');
    const kaardilehtIds = await this.findKaardilehtIds(ring);

    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
    const safeCode = code.replace(/[^a-zA-Z0-9]/g, '_');
    const ts = Date.now();
    const tempDirs: string[] = [];
    const tifFilenames: string[] = [];

    try {
      for (let i = 0; i < kaardilehtIds.length; i++) {
        const id = kaardilehtIds[i];
        emit(
          subject,
          'tif_download',
          `Laen kaardilehte (${i + 1}/${kaardilehtIds.length}): ${id}...`,
        );

        let zipUrls: string[];
        try {
          zipUrls = await this.getZipUrls(id);
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'tundmatu viga';
          emit(subject, 'tif_warning', `${id}: ZIP-faile ei leitud (${reason})`);
          continue;
        }
        let sheetDone = false;

        for (let attempt = 0; attempt < zipUrls.length; attempt++) {
          const zipUrl = zipUrls[attempt];
          const zipLabel = `${id} (versioon ${attempt + 1}/${zipUrls.length})`;
          const zipSavePath = path.join(
            OUTPUT_DIR,
            `${safeCode}_${ts}_${id}${attempt > 0 ? `_v${attempt + 1}` : ''}.zip`,
          );
          const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'metsam-'));
          tempDirs.push(tempDir);

          // Download and extract
          let tifPath: string;
          let worldFilePath: string;
          try {
            ({ tifPath, worldFilePath } = await this.downloadAndExtractTif(
              zipUrl,
              tempDir,
              zipSavePath,
            ));
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'tundmatu viga';
            emit(
              subject,
              'tif_warning',
              `${zipLabel}: TIF-faili ei leitud (${reason})${attempt + 1 < zipUrls.length ? ', proovin järgmist...' : ''}`,
            );
            continue;
          }

          const wf = this.parseWorldFile(worldFilePath);

          // Check that the bbox region has actual data (not mostly black)
          const usable = await this.isTifUsable(tifPath, wf, bbox);
          if (!usable) {
            emit(
              subject,
              'tif_warning',
              `${zipLabel}: TIF sisaldab peamiselt musti piksleid${attempt + 1 < zipUrls.length ? ', proovin vanemat versiooni...' : ''}`,
            );
            continue;
          }

          // Extract bbox region directly
          const meta = await sharp(tifPath, { limitInputPixels: false }).metadata();
          const tifW = meta.width!;
          const tifH = meta.height!;

          const pxLeft   = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
          const pxTop    = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
          const pxRight  = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
          const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
          const cropW = pxRight - pxLeft;
          const cropH = pxBottom - pxTop;

          if (cropW <= 0 || cropH <= 0) {
            emit(
              subject,
              'tif_warning',
              `${zipLabel}: kaardileht ei kata katastriüksust${attempt + 1 < zipUrls.length ? ', proovin järgmist...' : ''}`,
            );
            continue;
          }

          const suffix = kaardilehtIds.length > 1 ? `_${i + 1}of${kaardilehtIds.length}` : '';
          const tifFilename = `${safeCode}_${ts}${suffix}.tif`;

          // SVG mask: black outside polygon, white inside — used with multiply blend
          const toPixelCrop = (c: number[]): [number, number] => [
            Math.round((c[0] - wf.originX) / wf.pixelSizeX - pxLeft),
            Math.round((wf.originY - c[1]) / Math.abs(wf.pixelSizeY) - pxTop),
          ];
          const cropPoints = ring.map(toPixelCrop).map(([x, y]) => `${x},${y}`).join(' ');
          const svgMask = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">` +
            `<rect x="0" y="0" width="${cropW}" height="${cropH}" fill="black"/>` +
            `<polygon points="${cropPoints}" fill="white"/>` +
            `</svg>`,
          );

          // Step 1: extract bbox crop to buffer
          const cropBuf = await sharp(tifPath, { limitInputPixels: false })
            .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
            .png()
            .toBuffer();

          // Step 2: multiply mask onto crop (inside=original, outside=black)
          // Composite always produces 4 channels — strip alpha via raw to get clean 3-ch TIF
          const { data, info } = await sharp(cropBuf)
            .composite([{ input: svgMask, blend: 'multiply' }])
            .raw()
            .toBuffer({ resolveWithObject: true });

          const ch = info.channels as number;
          const rgbData =
            ch === 4
              ? (() => {
                  const b = Buffer.alloc(info.width * info.height * 3);
                  for (let p = 0; p < info.width * info.height; p++) {
                    b[p * 3]     = data[p * 4];
                    b[p * 3 + 1] = data[p * 4 + 1];
                    b[p * 3 + 2] = data[p * 4 + 2];
                  }
                  return b;
                })()
              : data;

          // Geo origin of the top-left pixel of the crop
          const outOriginX = wf.originX + pxLeft * wf.pixelSizeX;
          const outOriginY = wf.originY + pxTop * wf.pixelSizeY; // pixelSizeY < 0

          // Write as standard little-endian TIFF (sharp output) — readable by all tools
          const tifOutPath = path.join(OUTPUT_DIR, tifFilename);
          await sharp(rgbData, { raw: { width: info.width, height: info.height, channels: 3 } })
            .tiff({ compression: 'lzw' })
            .toFile(tifOutPath);

          // Patch GeoTIFF coordinate tags into the already-written file without touching pixel data
          await this.patchGeoTags(tifOutPath, wf.pixelSizeX, wf.pixelSizeY, outOriginX, outOriginY);

          // World file (.tfw) — pixel size and geo origin for GIS software
          await fs.promises.writeFile(
            path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.tfw')),
            [wf.pixelSizeX, 0, 0, wf.pixelSizeY, outOriginX, outOriginY].join('\n'),
          );

          // Projection file (.prj) — EPSG:3301 L-EST97 WKT so any GIS tool knows the CRS
          const prjWkt =
            'PROJCS["Estonian Coordinate System of 1997",' +
            'GEOGCS["GCS_Estonian_1997",DATUM["D_Estonian_1997",' +
            'SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
            'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
            'PROJECTION["Lambert_Conformal_Conic"],' +
            'PARAMETER["False_Easting",500000.0],' +
            'PARAMETER["False_Northing",6375000.0],' +
            'PARAMETER["Central_Meridian",24.0],' +
            'PARAMETER["Standard_Parallel_1",59.33333333333334],' +
            'PARAMETER["Standard_Parallel_2",58.0],' +
            'PARAMETER["Latitude_Of_Origin",57.51755393055556],' +
            'UNIT["Meter",1.0]]';
          await fs.promises.writeFile(
            path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.prj')),
            prjWkt,
          );

          tifFilenames.push(tifFilename);
          sheetDone = true;
          break;
        }

        if (!sheetDone) {
          emit(subject, 'tif_warning', `${id}: kõik versioonid kasutuskõlbmatud, jätan vahele`);
        }
      }

      if (!tifFilenames.length) throw new Error('TIF-failid ei kata katastriüksust');

      // Step 6 – CHM height data (non-fatal)
      emit(subject, 'chm_download', 'Laen kõrgusandmeid...');
      const chmKaardiruuts = [...new Set(kaardilehtIds.map((id) => id.substring(0, 4)))];
      const allHeightSamples: number[] = [];
      let allTotalPixels = 0;

      for (const ruut of chmKaardiruuts) {
        let chmUrls: string[];
        try {
          chmUrls = await this.getChmTifUrls(ruut);
        } catch {
          emit(subject, 'tif_warning', `CHM ${ruut}: faile ei leitud`);
          continue;
        }

        for (let attempt = 0; attempt < chmUrls.length; attempt++) {
          const tifSavePath = path.join(
            OUTPUT_DIR,
            `${safeCode}_${ts}_chm_${ruut}${attempt > 0 ? `_v${attempt + 1}` : ''}.tif`,
          );
          try {
            const dlRes = await axios.get<NodeJS.ReadableStream>(chmUrls[attempt], {
              responseType: 'stream',
              timeout: 300000,
            });
            await new Promise<void>((resolve, reject) => {
              const ws = fs.createWriteStream(tifSavePath);
              (dlRes.data as NodeJS.ReadableStream).pipe(ws).on('finish', resolve).on('error', reject);
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'tundmatu viga';
            emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: allalaadimine ebaõnnestus (${reason})`);
            continue;
          }

          let extracted: { samples: number[]; fullyCovered: boolean; totalPixels: number } | null = null;
          try {
            extracted = await this.extractChmHeights(tifSavePath, ring);
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'tundmatu viga';
            emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: ${reason}`);
          } finally {
            await fs.promises.unlink(tifSavePath).catch(() => {});
          }

          if (!extracted) continue;
          allHeightSamples.push(...extracted.samples);
          allTotalPixels += extracted.totalPixels;
          if (extracted.fullyCovered) break;
          if (attempt + 1 < chmUrls.length) {
            emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: ei kata täielikult, proovin vanemat...`);
          }
        }
      }

      const heightStats: ForestHeightStats | undefined =
        allHeightSamples.length > 0
          ? this.computeHeightStats(allHeightSamples, allTotalPixels)
          : undefined;

      // Step 7 – natural resource map (non-fatal)
      // Resources are saved to disk and served via /cadastre/resources/:file — NOT embedded in
      // the SSE payload, because thousands of GeoJSON features would overflow JSON.stringify.
      emit(subject, 'resources', 'Laen maavaraandmeid...');
      let resourceFile: string | undefined;
      let resourceCount = 0;
      try {
        const resources = await this.fetchNaturalResources(bbox);
        if (resources) {
          resourceCount = resources.features.length;
          const resourcesDir = path.join(OUTPUT_DIR, 'resources');
          await fs.promises.mkdir(resourcesDir, { recursive: true });
          resourceFile = `${safeCode}_${ts}.geojson`;
          await fs.promises.writeFile(
            path.join(resourcesDir, resourceFile),
            JSON.stringify(resources, null, 2),
          );
        }
      } catch {
        // Resource fetch is supplementary — don't fail the whole analysis
      }

      // Step 8 – tree detection (non-fatal: if the Python API is down we skip gracefully)
      emit(subject, 'tree_detection', 'Tuvastan puid...');
      let treeCount: number | undefined;
      let treePolygonPlot: string | undefined;
      if (tifFilenames.length > 0) {
        const firstTif = tifFilenames[0];
        const detection = await this.callTreeDetectionApi(
          path.join(OUTPUT_DIR, firstTif),
          firstTif,
        );
        if (detection) {
          treeCount = detection.treeCount;
          treePolygonPlot = detection.treePolygonPlot;
        } else {
          emit(subject, 'tif_warning', 'Puude tuvastus ebaõnnestus (API pole saadaval)');
        }
      }

      const info: CadastreInfo = {
        code,
        address: item.address?.shortAddress ?? '',
        area: item.area ?? 0,
        bbox,
        coordinates: polygon,
      };

      // Save the polygon-clipped WMS CIR image to disk for species analysis
      const cirFilename = `${safeCode}_${ts}.cir.png`;
      await fs.promises.writeFile(path.join(OUTPUT_DIR, cirFilename), wmsClippedBuffer);

      const result: AnalysisResult = {
        info,
        originalImage: wmsBuffer.toString('base64'),
        clippedImage: wmsClippedBuffer.toString('base64'),
        tifFiles: tifFilenames,
        cirFile: cirFilename,
        heightStats,
        resourceFile,
        resourceCount,
        treeCount,
        treePolygonPlot,
      };

      emit(subject, 'complete', 'Analüüs valmis!', result);
      subject.complete();
    } finally {
      for (const dir of tempDirs) {
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  private async findKaardilehtIds(ring: number[][]): Promise<string[]> {
    const posList = ring.map((c) => `${c[0]} ${c[1]}`).join(' ');
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<GetFeature xmlns="http://www.opengis.net/wfs" service="WFS" version="1.1.0" outputFormat="text/xml; subtype=gml/2.1.2" maxFeatures="30" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">
  <Query typeName="estonia:VWX2_META_KARTOGRAMM_VW3" srsName="EPSG:3301" xmlns:estonia="http://www.maaamet.ee/estonia">
    <PropertyName>NR_10000</PropertyName>
    <Filter xmlns="http://www.opengis.net/ogc">
      <Intersects>
        <PropertyName>GEOMETRY</PropertyName>
        <Polygon xmlns="http://www.opengis.net/gml" srsName="EPSG:3301">
          <exterior>
            <LinearRing>
              <posList>${posList}</posList>
            </LinearRing>
          </exterior>
        </Polygon>
      </Intersects>
    </Filter>
  </Query>
</GetFeature>`;

    const res = await axios.post<string>(KAARDILEHT_WFS, xmlBody, {
      headers: { 'Content-Type': 'text/xml' },
      responseType: 'text',
      timeout: 15000,
    }).catch(err => { throw new Error(`WFS (${KAARDILEHT_WFS}): ${err.message}`); });

    const matches = [...res.data.matchAll(/<[^>:]*:NR_10000[^>]*>([^<]+)<\/[^>:]*:NR_10000>/g)];
    if (!matches.length) throw new Error('Kaardilehte ei leitud katastriüksuse jaoks');
    return [...new Set(matches.map((m) => m[1].trim()))];
  }

  private async getZipUrls(kaardilehtId: string): Promise<string[]> {
    const url = `${GEOPORTAL_SEARCH}&kaardiruut=${encodeURIComponent(kaardilehtId)}&_=${Date.now()}`;
    const res = await axios.get<string>(url, { timeout: 15000 });
    const $ = cheerioLoad(res.data);

    const zipLinks: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const fMatch = href.match(/[?&]f=([^&]+\.zip)/i);
      if (fMatch && fMatch[1].toUpperCase().includes('GEOTIFF')) {
        const absolute = href.startsWith('http')
          ? href
          : `${GEOPORTAL_BASE}/${href.replace(/^\//, '')}`;
        zipLinks.push(absolute);
      }
    });

    if (!zipLinks.length) {
      throw new Error(`ZIP-faile ei leitud kaardilehe ${kaardilehtId} jaoks`);
    }
    // Newest date first (filenames contain YYYY_MM_DD)
    zipLinks.sort((a, b) => b.localeCompare(a));
    return zipLinks;
  }

  private async isTifUsable(tifPath: string, wf: WorldFile, bbox: BBox): Promise<boolean> {
    try {
      const meta = await sharp(tifPath, { limitInputPixels: false }).metadata();
      const tifW = meta.width ?? 0;
      const tifH = meta.height ?? 0;
      if (!tifW || !tifH) return false;

      const pxLeft   = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
      const pxTop    = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
      const pxRight  = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
      const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
      return pxRight > pxLeft && pxBottom > pxTop;
    } catch {
      return false;
    }
  }

  private async downloadAndExtractTif(
    zipUrl: string,
    tempDir: string,
    zipSavePath: string,
  ): Promise<{ tifPath: string; worldFilePath: string }> {
    // Download ZIP to disk (saved for inspection) then extract
    const res = await axios.get<NodeJS.ReadableStream>(zipUrl, {
      responseType: 'stream',
      timeout: 300000,
    });

    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(zipSavePath);
      (res.data as NodeJS.ReadableStream)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(zipSavePath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    const tifPath = await this.findFile(tempDir, '.tif');
    if (!tifPath) throw new Error('TIF-faili ei leitud ZIP-arhiivis');

    const worldFilePath =
      (await this.findFile(tempDir, '.twg')) ?? (await this.findFile(tempDir, '.tfw'));
    if (!worldFilePath) throw new Error('Worldfile (.twg/.tfw) ei leitud ZIP-arhiivis');

    return { tifPath, worldFilePath };
  }

  private async findFile(dir: string, ext: string): Promise<string | undefined> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await this.findFile(fullPath, ext);
        if (found) return found;
      } else if (entry.name.toLowerCase().endsWith(ext)) {
        return fullPath;
      }
    }
    return undefined;
  }

  private parseWorldFile(filePath: string): WorldFile {
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .trim()
      .split(/\r?\n/)
      .map((l) => parseFloat(l.trim()));
    // World file lines: A (pixelSizeX), D (rotY), B (rotX), E (pixelSizeY), C (originX), F (originY)
    return {
      pixelSizeX: lines[0],
      pixelSizeY: lines[3],
      originX: lines[4],
      originY: lines[5],
    };
  }

  /**
   * Patch GeoTIFF coordinate tags into a sharp-written little-endian TIFF without modifying
   * pixel data or format. Appends ModelPixelScaleTag, ModelTiepointTag and GeoKeyDirectoryTag
   * (EPSG:3301) then rewrites the IFD pointer to a new combined IFD at the end of the file.
   */
  private async patchGeoTags(
    filePath: string,
    pixelSizeX: number,
    pixelSizeY: number, // negative
    originX: number,
    originY: number,
  ): Promise<void> {
    const src = await fs.promises.readFile(filePath);

    // Validate little-endian TIFF magic
    if (src[0] !== 0x49 || src[1] !== 0x49 || src.readUInt16LE(2) !== 42) {
      throw new Error('patchGeoTags: expected little-endian TIFF (II/42)');
    }

    // Read existing IFD entries
    const ifdOff = src.readUInt32LE(4);
    const nOrig = src.readUInt16LE(ifdOff);
    const origEntries: Buffer[] = [];
    for (let i = 0; i < nOrig; i++) {
      origEntries.push(Buffer.from(src.subarray(ifdOff + 2 + i * 12, ifdOff + 2 + (i + 1) * 12)));
    }

    // Remove any pre-existing geo tags so we don't duplicate them
    const GEO_TAGS = new Set([33550, 33922, 34735, 34736, 34737]);
    const keepEntries = origEntries.filter(e => !GEO_TAGS.has(e.readUInt16LE(0)));

    // Build geo-data block appended at current EOF
    const geoBlock = Buffer.alloc(8 * 3 + 8 * 6 + 2 * 16); // 104 bytes
    let p = 0;
    const base = src.length;

    const mpsOff = base + p;
    geoBlock.writeDoubleLE(pixelSizeX,           p); p += 8;
    geoBlock.writeDoubleLE(Math.abs(pixelSizeY), p); p += 8;
    geoBlock.writeDoubleLE(0,                    p); p += 8;

    const mtpOff = base + p;
    geoBlock.writeDoubleLE(0,       p); p += 8; // raster i
    geoBlock.writeDoubleLE(0,       p); p += 8; // raster j
    geoBlock.writeDoubleLE(0,       p); p += 8; // raster k
    geoBlock.writeDoubleLE(originX, p); p += 8; // geo X (top-left pixel centre)
    geoBlock.writeDoubleLE(originY, p); p += 8; // geo Y
    geoBlock.writeDoubleLE(0,       p); p += 8; // geo Z

    const gkdOff = base + p;
    // GeoKeyDirectory: version 1.1.0, 3 keys: GTModelType=Projected, GTRasterType=PixelIsArea, ProjectedCSType=3301
    [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3301].forEach(v => {
      geoBlock.writeUInt16LE(v, p); p += 2;
    });

    const mkEntry = (tag: number, type: number, count: number, off: number): Buffer => {
      const e = Buffer.alloc(12);
      e.writeUInt16LE(tag,   0);
      e.writeUInt16LE(type,  2);
      e.writeUInt32LE(count, 4);
      e.writeUInt32LE(off,   8);
      return e;
    };

    // Combine old entries + new geo entries, sorted by tag number
    const allEntries = [
      ...keepEntries,
      mkEntry(33550, 12, 3,  mpsOff),  // ModelPixelScaleTag  (3 doubles)
      mkEntry(33922, 12, 6,  mtpOff),  // ModelTiepointTag    (6 doubles)
      mkEntry(34735,  3, 16, gkdOff),  // GeoKeyDirectoryTag  (16 shorts)
    ].sort((a, b) => a.readUInt16LE(0) - b.readUInt16LE(0));

    // New IFD sits after the geo data block
    const newIfdOff = src.length + geoBlock.length;
    const newIfd = Buffer.alloc(2 + allEntries.length * 12 + 4);
    newIfd.writeUInt16LE(allEntries.length, 0);
    allEntries.forEach((e, i) => e.copy(newIfd, 2 + i * 12));
    newIfd.writeUInt32LE(0, 2 + allEntries.length * 12); // no next IFD

    // Updated 8-byte header: byte order + magic unchanged, IFD pointer updated
    const newHdr = Buffer.from(src.subarray(0, 8));
    newHdr.writeUInt32LE(newIfdOff, 4);

    await fs.promises.writeFile(
      filePath,
      Buffer.concat([newHdr, src.subarray(8), geoBlock, newIfd]),
    );
  }

  private async fetchNaturalResources(bbox: BBox): Promise<ResourceData | null> {
    const posList = [
      `${bbox.minX} ${bbox.minY}`,
      `${bbox.maxX} ${bbox.minY}`,
      `${bbox.maxX} ${bbox.maxY}`,
      `${bbox.minX} ${bbox.maxY}`,
      `${bbox.minX} ${bbox.minY}`,
    ].join(' ');

    const wfsRequest =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<GetFeature xmlns="http://www.opengis.net/wfs" service="WFS" version="1.1.0" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">` +
      `<Query typeName="estonia:VWX2_MV_PLOKK" srsName="EPSG:3301" xmlns:estonia="http://www.maaamet.ee/estonia">` +
      `<Filter xmlns="http://www.opengis.net/ogc"><Intersects><PropertyName>GEOMETRY</PropertyName>` +
      `<Polygon xmlns="http://www.opengis.net/gml"><exterior><LinearRing>` +
      `<posList>${posList}</posList>` +
      `</LinearRing></exterior></Polygon></Intersects></Filter>` +
      `</Query></GetFeature>`;

    // API expects x-www-form-urlencoded with a single field "json" whose value is the JSON string
    const formBody = new URLSearchParams();
    formBody.append('json', JSON.stringify({
      application: 'maardlad',
      _fatLayer: 'mrd_varud_exp',
      type: 'GEOJSON',
      wfsRequest,
    }));

    const res = await axios.post(
      MAARDLAD_EXPORT,
      formBody.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0',
        },
        responseType: 'arraybuffer',
        timeout: 20000,
      },
    );

    // Unzip in memory and find the GeoJSON entry
    const zipBuf = Buffer.from(res.data as ArrayBuffer);
    const directory = await unzipper.Open.buffer(zipBuf);
    const geojsonEntry = directory.files.find(f => f.path.toLowerCase().endsWith('.geojson') || f.path.toLowerCase().endsWith('.json'));
    if (!geojsonEntry) return null;

    const content = (await geojsonEntry.buffer()).toString('utf-8');
    const data = JSON.parse(content) as ResourceData;
    if (!data?.features?.length) return null;
    return data;
  }

  // CHM files on geoportal are direct TIF downloads (no ZIP).
  private async getChmTifUrls(kaardiruut: string): Promise<string[]> {
    const url = `${GEOPORTAL_CHM_SEARCH}&kaardiruut=${encodeURIComponent(kaardiruut)}&_=${Date.now()}`;
    const res = await axios.get<string>(url, { timeout: 15000 });
    const $ = cheerioLoad(res.data);
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (/[?&]f=[^&]+\.tif/i.test(href)) {
        links.push(href.startsWith('http') ? href : `${GEOPORTAL_BASE}/${href.replace(/^\//, '')}`);
      }
    });
    if (!links.length) throw new Error(`CHM failid ei leitud: ${kaardiruut}`);
    links.sort((a, b) => b.localeCompare(a)); // year in filename → newest first
    return links;
  }

  // Read GeoTIFF embedded geotransform. GDAL writes the IFD at the END of the file,
  // so we seek to the IFD offset from the header rather than reading a fixed chunk.
  private readGeoTiffTransform(tifPath: string): WorldFile {
    const fd = fs.openSync(tifPath, 'r');
    try {
      const hdr = Buffer.alloc(8);
      fs.readSync(fd, hdr, 0, 8, 0);
      const isLE = hdr[0] === 0x49;
      const r16 = (b: Buffer, o: number) => (isLE ? b.readUInt16LE(o) : b.readUInt16BE(o));
      const r32 = (b: Buffer, o: number) => (isLE ? b.readUInt32LE(o) : b.readUInt32BE(o));
      const r64 = (b: Buffer, o: number) => (isLE ? b.readDoubleLE(o) : b.readDoubleBE(o));
      if (r16(hdr, 2) !== 42) throw new Error('Vigane TIFF fail');

      let ifdOff = r32(hdr, 4);
      let scaleX = 0, scaleY = 0, originX = 0, originY = 0;
      let hasScale = false, hasTie = false;

      while (ifdOff > 0 && !(hasScale && hasTie)) {
        const cntBuf = Buffer.alloc(2);
        fs.readSync(fd, cntBuf, 0, 2, ifdOff);
        const n = r16(cntBuf, 0);
        const ifdBuf = Buffer.alloc(n * 12);
        fs.readSync(fd, ifdBuf, 0, n * 12, ifdOff + 2);

        for (let i = 0; i < n && !(hasScale && hasTie); i++) {
          const e = i * 12;
          const tag = r16(ifdBuf, e);
          const dataOff = r32(ifdBuf, e + 8);
          if (tag === 33550 && !hasScale) {       // ModelPixelScaleTag
            const d = Buffer.alloc(24);
            fs.readSync(fd, d, 0, 24, dataOff);
            scaleX = r64(d, 0); scaleY = r64(d, 8); hasScale = true;
          } else if (tag === 33922 && !hasTie) {  // ModelTiepointTag
            const d = Buffer.alloc(48);
            fs.readSync(fd, d, 0, 48, dataOff);
            originX = r64(d, 24); originY = r64(d, 32); hasTie = true;
          }
        }

        const nxtBuf = Buffer.alloc(4);
        fs.readSync(fd, nxtBuf, 0, 4, ifdOff + 2 + n * 12);
        ifdOff = r32(nxtBuf, 0);
      }

      if (!hasScale || !hasTie) throw new Error('GeoTIFF georeference tagid puuduvad');
      return { pixelSizeX: scaleX, pixelSizeY: -scaleY, originX, originY };
    } finally {
      fs.closeSync(fd);
    }
  }

  private async extractChmHeights(
    tifPath: string,
    ring: number[][],
  ): Promise<{ samples: number[]; fullyCovered: boolean; totalPixels: number }> {
    const wf = this.readGeoTiffTransform(tifPath);
    const meta = await sharp(tifPath, { limitInputPixels: false }).metadata();
    const tifW = meta.width ?? 0;
    const tifH = meta.height ?? 0;
    if (!tifW || !tifH) return { samples: [], fullyCovered: false, totalPixels: 0 };

    const ringXs = ring.map((c) => c[0]);
    const ringYs = ring.map((c) => c[1]);
    const polyMinX = Math.min(...ringXs), polyMaxX = Math.max(...ringXs);
    const polyMinY = Math.min(...ringYs), polyMaxY = Math.max(...ringYs);

    const fullyCovered =
      polyMinX >= wf.originX &&
      polyMaxX <= wf.originX + tifW * wf.pixelSizeX &&
      polyMinY >= wf.originY + tifH * wf.pixelSizeY &&
      polyMaxY <= wf.originY;

    const pxLeft   = Math.max(0, Math.floor((polyMinX - wf.originX) / wf.pixelSizeX));
    const pxTop    = Math.max(0, Math.floor((wf.originY - polyMaxY) / Math.abs(wf.pixelSizeY)));
    const pxRight  = Math.min(tifW, Math.ceil((polyMaxX - wf.originX) / wf.pixelSizeX));
    const pxBottom = Math.min(tifH, Math.ceil((wf.originY - polyMinY) / Math.abs(wf.pixelSizeY)));
    const cropW = pxRight - pxLeft;
    const cropH = pxBottom - pxTop;
    if (cropW <= 0 || cropH <= 0) return { samples: [], fullyCovered: false, totalPixels: 0 };

    const rawBuffer = await sharp(tifPath, { limitInputPixels: false })
      .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
      .raw()
      .toBuffer();

    const channels = meta.channels ?? 1;
    const bytesPerSample = rawBuffer.length / (cropW * cropH * channels);

    let totalPixels = 0;
    const samples: number[] = [];

    for (let row = 0; row < cropH; row++) {
      for (let col = 0; col < cropW; col++) {
        const geoX = wf.originX + (pxLeft + col + 0.5) * wf.pixelSizeX;
        const geoY = wf.originY + (pxTop + row + 0.5) * wf.pixelSizeY;
        if (!this.pointInPolygon(geoX, geoY, ring)) continue;
        totalPixels++;

        const i = (row * cropW + col) * channels;
        let val: number;
        if (bytesPerSample === 4) val = rawBuffer.readFloatLE(i * 4);
        else if (bytesPerSample === 2) val = rawBuffer.readUInt16LE(i * 2);
        else val = rawBuffer[i];

        if (!isFinite(val) || isNaN(val) || val <= 4) continue; // only forest (> 4 m)
        samples.push(val);
      }
    }

    return { samples, fullyCovered, totalPixels };
  }

  private pointInPolygon(x: number, y: number, ring: number[][]): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  private async callTreeDetectionApi(
    tifPath: string,
    filename: string,
  ): Promise<{ treeCount: number; treePolygonPlot: string } | null> {
    try {
      const fileBuffer = await fs.promises.readFile(tifPath);
      const blob = new Blob([fileBuffer], { type: 'image/tiff' });
      const formData = new FormData();
      formData.append('file', blob, filename);
      const res = await axios.post<{ tree_count: number; plot: string | null }>(
        'http://localhost:8000/detect',
        formData,
        { timeout: 300_000 },
      );
      if (res.data.plot == null) return null;
      return { treeCount: res.data.tree_count, treePolygonPlot: res.data.plot };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      console.warn(`Tree detection API unavailable: ${reason}`);
      return null;
    }
  }

  private computeHeightStats(samples: number[], totalPixels: number): ForestHeightStats {
    const forestPixelCount = samples.length;
    const averageHeight =
      forestPixelCount > 0 ? samples.reduce((s, v) => s + v, 0) / forestPixelCount : 0;
    const shares = [10, 15, 20, 25].map((t) => ({
      threshold: t,
      percentage:
        forestPixelCount > 0
          ? (samples.filter((v) => v > t).length / forestPixelCount) * 100
          : 0,
    }));
    return { averageHeight, forestPixelCount, totalPixelCount: totalPixels, shares };
  }

}

interface CadastreApiItem {
  id: number;
  code: string;
  address: { shortAddress: string; adsLevel1: string; adsLevel2: string; adsLevel3: string };
  area: number;
  geometry: string;
}
