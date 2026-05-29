"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CadastreService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const rxjs_1 = require("rxjs");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const cheerio_1 = require("cheerio");
const unzipper = __importStar(require("unzipper"));
const CADASTRE_API = 'https://kolvikud.kataster.ee/api/cadastre-unit/find?date=2024-02-01&code=';
const WMS_BASE = 'https://xgis.maaamet.ee/xgis2/service/17bup8p?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&FORMAT=image%2Fjpeg&STYLES=&TRANSPARENT=TRUE&LAYERS=cir_ngr&SRS=EPSG%3A3301';
const KAARDILEHT_WFS = 'https://xgis.maaamet.ee/xgis2/service/4mneci';
const GEOPORTAL_SEARCH = 'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=610&andmetyyp=ortofoto_eesti_ngr';
const GEOPORTAL_CHM_SEARCH = 'https://geoportaal.maaamet.ee/index.php?lang_id=1&plugin_act=otsing&page_id=614&andmetyyp=chm_geotiff';
const GEOPORTAL_BASE = 'https://geoportaal.maaamet.ee';
const MAX_IMG_PX = 800;
const PADDING_RATIO = 0.05;
const OUTPUT_DIR = path.join(process.cwd(), 'output');
function emit(subject, step, message, payload) {
    const obj = { step, message };
    if (payload !== undefined)
        obj.payload = payload;
    subject.next({ data: JSON.stringify(obj) });
}
let CadastreService = class CadastreService {
    analyze(code) {
        const subject = new rxjs_1.Subject();
        this.run(code, subject).catch((err) => {
            emit(subject, 'error', err.message ?? 'Tundmatu viga');
            subject.complete();
        });
        return subject.asObservable();
    }
    async run(code, subject) {
        emit(subject, 'fetching', 'Laen katastriandmeid...');
        const cadastreRes = await axios_1.default.get(`${CADASTRE_API}${encodeURIComponent(code)}`, { timeout: 15000 });
        const items = cadastreRes.data;
        if (!items?.length)
            throw new Error(`Katastriüksust ei leitud: ${code}`);
        const item = items[0];
        const geomParsed = JSON.parse(item.geometry);
        if (!geomParsed || geomParsed.type !== 'Polygon') {
            throw new Error('Katastriüksuse geomeetria pole Polygon');
        }
        const polygon = geomParsed.coordinates;
        const ring = polygon[0];
        emit(subject, 'bbox', 'Arvutan piirikasti...');
        const xs = ring.map((c) => c[0]);
        const ys = ring.map((c) => c[1]);
        const padX = (Math.max(...xs) - Math.min(...xs)) * PADDING_RATIO;
        const padY = (Math.max(...ys) - Math.min(...ys)) * PADDING_RATIO;
        const bbox = {
            minX: Math.min(...xs) - padX,
            maxX: Math.max(...xs) + padX,
            minY: Math.min(...ys) - padY,
            maxY: Math.max(...ys) + padY,
        };
        emit(subject, 'downloading', 'Laen aerofotot...');
        const bboxW = bbox.maxX - bbox.minX;
        const bboxH = bbox.maxY - bbox.minY;
        const scale = MAX_IMG_PX / Math.max(bboxW, bboxH);
        const imgW = Math.round(bboxW * scale);
        const imgH = Math.round(bboxH * scale);
        const wmsUrl = `${WMS_BASE}&WIDTH=${imgW}&HEIGHT=${imgH}` +
            `&BBOX=${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`;
        const wmsRes = await axios_1.default.get(wmsUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
        });
        const wmsBuffer = Buffer.from(wmsRes.data);
        emit(subject, 'clipping', 'Lõikan katastriüksust...');
        const toPixelWms = (c) => [
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
        const wmsClippedBuffer = await (0, sharp_1.default)(wmsBuffer)
            .png()
            .composite([{ input: Buffer.from(wmsSvgMask), blend: 'dest-in' }])
            .toBuffer();
        emit(subject, 'kaardileht', 'Otsin kaardilehti...');
        const kaardilehtIds = await this.findKaardilehtIds(ring);
        await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
        const safeCode = code.replace(/[^a-zA-Z0-9]/g, '_');
        const ts = Date.now();
        const tempDirs = [];
        const tifFilenames = [];
        try {
            for (let i = 0; i < kaardilehtIds.length; i++) {
                const id = kaardilehtIds[i];
                emit(subject, 'tif_download', `Laen kaardilehte (${i + 1}/${kaardilehtIds.length}): ${id}...`);
                const zipUrls = await this.getZipUrls(id);
                let sheetDone = false;
                for (let attempt = 0; attempt < zipUrls.length; attempt++) {
                    const zipUrl = zipUrls[attempt];
                    const zipLabel = `${id} (versioon ${attempt + 1}/${zipUrls.length})`;
                    const zipSavePath = path.join(OUTPUT_DIR, `${safeCode}_${ts}_${id}${attempt > 0 ? `_v${attempt + 1}` : ''}.zip`);
                    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'metsam-'));
                    tempDirs.push(tempDir);
                    let tifPath;
                    let worldFilePath;
                    try {
                        ({ tifPath, worldFilePath } = await this.downloadAndExtractTif(zipUrl, tempDir, zipSavePath));
                    }
                    catch (err) {
                        const reason = err instanceof Error ? err.message : 'tundmatu viga';
                        emit(subject, 'tif_warning', `${zipLabel}: TIF-faili ei leitud (${reason})${attempt + 1 < zipUrls.length ? ', proovin järgmist...' : ''}`);
                        continue;
                    }
                    const wf = this.parseWorldFile(worldFilePath);
                    const usable = await this.isTifUsable(tifPath, wf, bbox);
                    if (!usable) {
                        emit(subject, 'tif_warning', `${zipLabel}: TIF sisaldab peamiselt musti piksleid${attempt + 1 < zipUrls.length ? ', proovin vanemat versiooni...' : ''}`);
                        continue;
                    }
                    const meta = await (0, sharp_1.default)(tifPath, { limitInputPixels: false }).metadata();
                    const tifW = meta.width;
                    const tifH = meta.height;
                    const pxLeft = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
                    const pxTop = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
                    const pxRight = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
                    const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
                    const cropW = pxRight - pxLeft;
                    const cropH = pxBottom - pxTop;
                    if (cropW <= 0 || cropH <= 0) {
                        emit(subject, 'tif_warning', `${zipLabel}: kaardileht ei kata katastriüksust${attempt + 1 < zipUrls.length ? ', proovin järgmist...' : ''}`);
                        continue;
                    }
                    const suffix = kaardilehtIds.length > 1 ? `_${i + 1}of${kaardilehtIds.length}` : '';
                    const tifFilename = `${safeCode}_${ts}${suffix}.tif`;
                    const toPixelCrop = (c) => [
                        Math.round((c[0] - wf.originX) / wf.pixelSizeX - pxLeft),
                        Math.round((wf.originY - c[1]) / Math.abs(wf.pixelSizeY) - pxTop),
                    ];
                    const cropPoints = ring.map(toPixelCrop).map(([x, y]) => `${x},${y}`).join(' ');
                    const svgMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">` +
                        `<rect x="0" y="0" width="${cropW}" height="${cropH}" fill="black"/>` +
                        `<polygon points="${cropPoints}" fill="white"/>` +
                        `</svg>`);
                    const cropBuf = await (0, sharp_1.default)(tifPath, { limitInputPixels: false })
                        .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
                        .png()
                        .toBuffer();
                    const { data, info } = await (0, sharp_1.default)(cropBuf)
                        .composite([{ input: svgMask, blend: 'multiply' }])
                        .raw()
                        .toBuffer({ resolveWithObject: true });
                    const ch = info.channels;
                    const rgbData = ch === 4
                        ? (() => {
                            const b = Buffer.alloc(info.width * info.height * 3);
                            for (let p = 0; p < info.width * info.height; p++) {
                                b[p * 3] = data[p * 4];
                                b[p * 3 + 1] = data[p * 4 + 1];
                                b[p * 3 + 2] = data[p * 4 + 2];
                            }
                            return b;
                        })()
                        : data;
                    const outOriginX = wf.originX + pxLeft * wf.pixelSizeX;
                    const outOriginY = wf.originY + pxTop * wf.pixelSizeY;
                    await (0, sharp_1.default)(rgbData, { raw: { width: info.width, height: info.height, channels: 3 } })
                        .tiff({ compression: 'lzw' })
                        .toFile(path.join(OUTPUT_DIR, tifFilename));
                    await fs.promises.writeFile(path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.tfw')), [wf.pixelSizeX, 0, 0, wf.pixelSizeY, outOriginX, outOriginY].join('\n'));
                    const prjWkt = 'PROJCS["Estonian Coordinate System of 1997",' +
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
                    await fs.promises.writeFile(path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.prj')), prjWkt);
                    tifFilenames.push(tifFilename);
                    sheetDone = true;
                    break;
                }
                if (!sheetDone) {
                    emit(subject, 'tif_warning', `${id}: kõik versioonid kasutuskõlbmatud, jätan vahele`);
                }
            }
            if (!tifFilenames.length)
                throw new Error('TIF-failid ei kata katastriüksust');
            emit(subject, 'chm_download', 'Laen kõrgusandmeid...');
            const chmKaardiruuts = [...new Set(kaardilehtIds.map((id) => id.substring(0, 4)))];
            const allHeightSamples = [];
            let allTotalPixels = 0;
            for (const ruut of chmKaardiruuts) {
                let chmUrls;
                try {
                    chmUrls = await this.getChmTifUrls(ruut);
                }
                catch {
                    emit(subject, 'tif_warning', `CHM ${ruut}: faile ei leitud`);
                    continue;
                }
                for (let attempt = 0; attempt < chmUrls.length; attempt++) {
                    const tifSavePath = path.join(OUTPUT_DIR, `${safeCode}_${ts}_chm_${ruut}${attempt > 0 ? `_v${attempt + 1}` : ''}.tif`);
                    try {
                        const dlRes = await axios_1.default.get(chmUrls[attempt], {
                            responseType: 'stream',
                            timeout: 300000,
                        });
                        await new Promise((resolve, reject) => {
                            const ws = fs.createWriteStream(tifSavePath);
                            dlRes.data.pipe(ws).on('finish', resolve).on('error', reject);
                        });
                    }
                    catch (err) {
                        const reason = err instanceof Error ? err.message : 'tundmatu viga';
                        emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: allalaadimine ebaõnnestus (${reason})`);
                        continue;
                    }
                    let extracted = null;
                    try {
                        extracted = await this.extractChmHeights(tifSavePath, ring);
                    }
                    catch (err) {
                        const reason = err instanceof Error ? err.message : 'tundmatu viga';
                        emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: ${reason}`);
                    }
                    finally {
                        await fs.promises.unlink(tifSavePath).catch(() => { });
                    }
                    if (!extracted)
                        continue;
                    allHeightSamples.push(...extracted.samples);
                    allTotalPixels += extracted.totalPixels;
                    if (extracted.fullyCovered)
                        break;
                    if (attempt + 1 < chmUrls.length) {
                        emit(subject, 'tif_warning', `CHM ${ruut} v${attempt + 1}: ei kata täielikult, proovin vanemat...`);
                    }
                }
            }
            const heightStats = allHeightSamples.length > 0
                ? this.computeHeightStats(allHeightSamples, allTotalPixels)
                : undefined;
            const info = {
                code,
                address: item.address?.shortAddress ?? '',
                area: item.area ?? 0,
                bbox,
                coordinates: polygon,
            };
            const result = {
                info,
                originalImage: wmsBuffer.toString('base64'),
                clippedImage: wmsClippedBuffer.toString('base64'),
                tifFiles: tifFilenames,
                heightStats,
            };
            emit(subject, 'complete', 'Analüüs valmis!', result);
            subject.complete();
        }
        finally {
            for (const dir of tempDirs) {
                await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => { });
            }
        }
    }
    async findKaardilehtIds(ring) {
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
        const res = await axios_1.default.post(KAARDILEHT_WFS, xmlBody, {
            headers: { 'Content-Type': 'text/xml' },
            responseType: 'text',
            timeout: 15000,
        });
        const matches = [...res.data.matchAll(/<[^>:]*:NR_10000[^>]*>([^<]+)<\/[^>:]*:NR_10000>/g)];
        if (!matches.length)
            throw new Error('Kaardilehte ei leitud katastriüksuse jaoks');
        return [...new Set(matches.map((m) => m[1].trim()))];
    }
    async getZipUrls(kaardilehtId) {
        const url = `${GEOPORTAL_SEARCH}&kaardiruut=${encodeURIComponent(kaardilehtId)}&_=${Date.now()}`;
        const res = await axios_1.default.get(url, { timeout: 15000 });
        const $ = (0, cheerio_1.load)(res.data);
        const zipLinks = [];
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
        zipLinks.sort((a, b) => b.localeCompare(a));
        return zipLinks;
    }
    async isTifUsable(tifPath, wf, bbox) {
        try {
            const meta = await (0, sharp_1.default)(tifPath, { limitInputPixels: false }).metadata();
            const tifW = meta.width ?? 0;
            const tifH = meta.height ?? 0;
            if (!tifW || !tifH)
                return false;
            const pxLeft = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
            const pxTop = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
            const pxRight = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
            const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
            return pxRight > pxLeft && pxBottom > pxTop;
        }
        catch {
            return false;
        }
    }
    async downloadAndExtractTif(zipUrl, tempDir, zipSavePath) {
        const res = await axios_1.default.get(zipUrl, {
            responseType: 'stream',
            timeout: 300000,
        });
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(zipSavePath);
            res.data
                .pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
        });
        await new Promise((resolve, reject) => {
            fs.createReadStream(zipSavePath)
                .pipe(unzipper.Extract({ path: tempDir }))
                .on('close', resolve)
                .on('error', reject);
        });
        const tifPath = await this.findFile(tempDir, '.tif');
        if (!tifPath)
            throw new Error('TIF-faili ei leitud ZIP-arhiivis');
        const worldFilePath = (await this.findFile(tempDir, '.twg')) ?? (await this.findFile(tempDir, '.tfw'));
        if (!worldFilePath)
            throw new Error('Worldfile (.twg/.tfw) ei leitud ZIP-arhiivis');
        return { tifPath, worldFilePath };
    }
    async findFile(dir, ext) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = await this.findFile(fullPath, ext);
                if (found)
                    return found;
            }
            else if (entry.name.toLowerCase().endsWith(ext)) {
                return fullPath;
            }
        }
        return undefined;
    }
    parseWorldFile(filePath) {
        const lines = fs
            .readFileSync(filePath, 'utf-8')
            .trim()
            .split(/\r?\n/)
            .map((l) => parseFloat(l.trim()));
        return {
            pixelSizeX: lines[0],
            pixelSizeY: lines[3],
            originX: lines[4],
            originY: lines[5],
        };
    }
    async getChmTifUrls(kaardiruut) {
        const url = `${GEOPORTAL_CHM_SEARCH}&kaardiruut=${encodeURIComponent(kaardiruut)}&_=${Date.now()}`;
        const res = await axios_1.default.get(url, { timeout: 15000 });
        const $ = (0, cheerio_1.load)(res.data);
        const links = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') ?? '';
            if (/[?&]f=[^&]+\.tif/i.test(href)) {
                links.push(href.startsWith('http') ? href : `${GEOPORTAL_BASE}/${href.replace(/^\//, '')}`);
            }
        });
        if (!links.length)
            throw new Error(`CHM failid ei leitud: ${kaardiruut}`);
        links.sort((a, b) => b.localeCompare(a));
        return links;
    }
    readGeoTiffTransform(tifPath) {
        const fd = fs.openSync(tifPath, 'r');
        try {
            const hdr = Buffer.alloc(8);
            fs.readSync(fd, hdr, 0, 8, 0);
            const isLE = hdr[0] === 0x49;
            const r16 = (b, o) => (isLE ? b.readUInt16LE(o) : b.readUInt16BE(o));
            const r32 = (b, o) => (isLE ? b.readUInt32LE(o) : b.readUInt32BE(o));
            const r64 = (b, o) => (isLE ? b.readDoubleLE(o) : b.readDoubleBE(o));
            if (r16(hdr, 2) !== 42)
                throw new Error('Vigane TIFF fail');
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
                    if (tag === 33550 && !hasScale) {
                        const d = Buffer.alloc(24);
                        fs.readSync(fd, d, 0, 24, dataOff);
                        scaleX = r64(d, 0);
                        scaleY = r64(d, 8);
                        hasScale = true;
                    }
                    else if (tag === 33922 && !hasTie) {
                        const d = Buffer.alloc(48);
                        fs.readSync(fd, d, 0, 48, dataOff);
                        originX = r64(d, 24);
                        originY = r64(d, 32);
                        hasTie = true;
                    }
                }
                const nxtBuf = Buffer.alloc(4);
                fs.readSync(fd, nxtBuf, 0, 4, ifdOff + 2 + n * 12);
                ifdOff = r32(nxtBuf, 0);
            }
            if (!hasScale || !hasTie)
                throw new Error('GeoTIFF georeference tagid puuduvad');
            return { pixelSizeX: scaleX, pixelSizeY: -scaleY, originX, originY };
        }
        finally {
            fs.closeSync(fd);
        }
    }
    async extractChmHeights(tifPath, ring) {
        const wf = this.readGeoTiffTransform(tifPath);
        const meta = await (0, sharp_1.default)(tifPath, { limitInputPixels: false }).metadata();
        const tifW = meta.width ?? 0;
        const tifH = meta.height ?? 0;
        if (!tifW || !tifH)
            return { samples: [], fullyCovered: false, totalPixels: 0 };
        const ringXs = ring.map((c) => c[0]);
        const ringYs = ring.map((c) => c[1]);
        const polyMinX = Math.min(...ringXs), polyMaxX = Math.max(...ringXs);
        const polyMinY = Math.min(...ringYs), polyMaxY = Math.max(...ringYs);
        const fullyCovered = polyMinX >= wf.originX &&
            polyMaxX <= wf.originX + tifW * wf.pixelSizeX &&
            polyMinY >= wf.originY + tifH * wf.pixelSizeY &&
            polyMaxY <= wf.originY;
        const pxLeft = Math.max(0, Math.floor((polyMinX - wf.originX) / wf.pixelSizeX));
        const pxTop = Math.max(0, Math.floor((wf.originY - polyMaxY) / Math.abs(wf.pixelSizeY)));
        const pxRight = Math.min(tifW, Math.ceil((polyMaxX - wf.originX) / wf.pixelSizeX));
        const pxBottom = Math.min(tifH, Math.ceil((wf.originY - polyMinY) / Math.abs(wf.pixelSizeY)));
        const cropW = pxRight - pxLeft;
        const cropH = pxBottom - pxTop;
        if (cropW <= 0 || cropH <= 0)
            return { samples: [], fullyCovered: false, totalPixels: 0 };
        const rawBuffer = await (0, sharp_1.default)(tifPath, { limitInputPixels: false })
            .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
            .raw()
            .toBuffer();
        const channels = meta.channels ?? 1;
        const bytesPerSample = rawBuffer.length / (cropW * cropH * channels);
        let totalPixels = 0;
        const samples = [];
        for (let row = 0; row < cropH; row++) {
            for (let col = 0; col < cropW; col++) {
                const geoX = wf.originX + (pxLeft + col + 0.5) * wf.pixelSizeX;
                const geoY = wf.originY + (pxTop + row + 0.5) * wf.pixelSizeY;
                if (!this.pointInPolygon(geoX, geoY, ring))
                    continue;
                totalPixels++;
                const i = (row * cropW + col) * channels;
                let val;
                if (bytesPerSample === 4)
                    val = rawBuffer.readFloatLE(i * 4);
                else if (bytesPerSample === 2)
                    val = rawBuffer.readUInt16LE(i * 2);
                else
                    val = rawBuffer[i];
                if (!isFinite(val) || isNaN(val) || val <= 4)
                    continue;
                samples.push(val);
            }
        }
        return { samples, fullyCovered, totalPixels };
    }
    pointInPolygon(x, y, ring) {
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
    computeHeightStats(samples, totalPixels) {
        const forestPixelCount = samples.length;
        const averageHeight = forestPixelCount > 0 ? samples.reduce((s, v) => s + v, 0) / forestPixelCount : 0;
        const shares = [10, 15, 20, 25].map((t) => ({
            threshold: t,
            percentage: forestPixelCount > 0
                ? (samples.filter((v) => v > t).length / forestPixelCount) * 100
                : 0,
        }));
        return { averageHeight, forestPixelCount, totalPixelCount: totalPixels, shares };
    }
};
exports.CadastreService = CadastreService;
exports.CadastreService = CadastreService = __decorate([
    (0, common_1.Injectable)()
], CadastreService);
//# sourceMappingURL=cadastre.service.js.map