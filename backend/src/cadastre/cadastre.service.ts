import { Injectable } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';
import { Observable, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { load as cheerioLoad } from 'cheerio';
import * as unzipper from 'unzipper';
import { writeArrayBuffer } from 'geotiff';

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

export interface AnalysisResult {
  info: CadastreInfo;
  originalImage: string;
  clippedImage: string;
  tifFiles: string[];
  heightStats?: ForestHeightStats;
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
const GEOPORTAL_CHM_SEARCH =
  'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=614&andmetyyp=chm_geotiff';
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

          // Write a proper GeoTIFF with embedded ModelPixelScale, ModelTiepoint and EPSG:3301
          const geoTiffBuf = writeArrayBuffer(rgbData, {
            height: info.height,
            width: info.width,
            SamplesPerPixel: 3,
            PhotometricInterpretation: 2, // RGB
            Compression: 5,               // LZW
            ModelPixelScale: [wf.pixelSizeX, Math.abs(wf.pixelSizeY), 0],
            ModelTiepoint: [0, 0, 0, outOriginX, outOriginY, 0],
            GTModelTypeGeoKey:     1,    // Projected CRS
            GTRasterTypeGeoKey:    1,    // PixelIsArea
            ProjectedCSTypeGeoKey: 3301, // EPSG:3301 L-EST97
          });
          await fs.promises.writeFile(path.join(OUTPUT_DIR, tifFilename), Buffer.from(geoTiffBuf));

          // Keep a companion world file as fallback for older GIS software
          await fs.promises.writeFile(
            path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.tfw')),
            [wf.pixelSizeX, 0, 0, wf.pixelSizeY, outOriginX, outOriginY].join('\n'),
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
        heightStats,
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
