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

export interface AnalysisResult {
  info: CadastreInfo;
  originalImage: string;
  clippedImage: string;
  tifFiles: string[];
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
  'https://xgis.maaamet.ee/xgis2/service/17bup8p?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&FORMAT=image%2Fjpeg&STYLES=&TRANSPARENT=TRUE&LAYERS=cir_ngr&SRS=EPSG%3A3301';
const KAARDILEHT_WFS = 'https://xgis.maaamet.ee/xgis2/service/4mneci';
const GEOPORTAL_SEARCH =
  'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=610&andmetyyp=ortofoto_eesti_ngr';
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
    const cadastreRes = await axios.get<CadastreApiItem[]>(
      `${CADASTRE_API}${encodeURIComponent(code)}`,
      { timeout: 15000 },
    );

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
    });
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

        const zipUrls = await this.getZipUrls(id);
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
          let usable: boolean;
          try {
            usable = await this.isTifUsable(tifPath, wf, bbox);
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'tundmatu viga';
            emit(
              subject,
              'tif_warning',
              `${zipLabel}: TIF kontrollimine ebaõnnestus (${reason})${attempt + 1 < zipUrls.length ? ', proovin vanemat versiooni...' : ''}`,
            );
            continue;
          }
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

          // Convert cadaster ring to pixel coordinates within the crop
          const toPixelInCrop = (c: number[]): [number, number] => [
            Math.round((c[0] - wf.originX) / wf.pixelSizeX - pxLeft),
            Math.round((wf.originY - c[1]) / Math.abs(wf.pixelSizeY) - pxTop),
          ];
          const points = ring
            .map(toPixelInCrop)
            .map(([px, py]) => `${px},${py}`)
            .join(' ');
          // Black background + white polygon: multiply blend zeros out pixels outside the ring
          const svgMask = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">` +
            `<rect x="0" y="0" width="${cropW}" height="${cropH}" fill="black"/>` +
            `<polygon points="${points}" fill="white"/>` +
            `</svg>`,
          );

          // Step 1: extract bbox crop to buffer (limitInputPixels needed for large TIFs)
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

      const info: CadastreInfo = {
        code,
        address: item.address?.shortAddress ?? '',
        area: item.area ?? 0,
        bbox,
        coordinates: polygon,
      };

      const result: AnalysisResult = {
        info,
        originalImage: wmsBuffer.toString('base64'),
        clippedImage: wmsClippedBuffer.toString('base64'),
        tifFiles: tifFilenames,
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
    });

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
    const meta = await sharp(tifPath, { limitInputPixels: false }).metadata();
    const tifW = meta.width ?? 0;
    const tifH = meta.height ?? 0;
    if (!tifW || !tifH) return false;

    const pxLeft   = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
    const pxTop    = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
    const pxRight  = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
    const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
    const cropW = pxRight - pxLeft;
    const cropH = pxBottom - pxTop;
    if (cropW <= 0 || cropH <= 0) return false;

    // sharp .stats() ignores chained .extract() and reports whole-image statistics.
    // Extract to a buffer first, then create a fresh instance to get correct crop stats.
    const cropBuf = await sharp(tifPath, { limitInputPixels: false })
      .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
      .png()
      .toBuffer();

    const stats = await sharp(cropBuf).stats();
    // PNG is always 8-bit; usable if any channel mean exceeds 2% of 255 ≈ 5
    return stats.channels.some((ch) => ch.mean > 5);
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

}

interface CadastreApiItem {
  id: number;
  code: string;
  address: { shortAddress: string; adsLevel1: string; adsLevel2: string; adsLevel3: string };
  area: number;
  geometry: string;
}
