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
                    const meta = await (0, sharp_1.default)(tifPath).metadata();
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
                    await (0, sharp_1.default)(tifPath)
                        .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
                        .tiff({ compression: 'lzw' })
                        .toFile(path.join(OUTPUT_DIR, tifFilename));
                    const outOriginX = wf.originX + pxLeft * wf.pixelSizeX;
                    const outOriginY = wf.originY + pxTop * wf.pixelSizeY;
                    await fs.promises.writeFile(path.join(OUTPUT_DIR, tifFilename.replace('.tif', '.tfw')), [wf.pixelSizeX, 0, 0, wf.pixelSizeY, outOriginX, outOriginY].join('\n'));
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
            const meta = await (0, sharp_1.default)(tifPath).metadata();
            const tifW = meta.width ?? 0;
            const tifH = meta.height ?? 0;
            if (!tifW || !tifH)
                return false;
            const pxLeft = Math.max(0, Math.floor((bbox.minX - wf.originX) / wf.pixelSizeX));
            const pxTop = Math.max(0, Math.floor((wf.originY - bbox.maxY) / Math.abs(wf.pixelSizeY)));
            const pxRight = Math.min(tifW, Math.ceil((bbox.maxX - wf.originX) / wf.pixelSizeX));
            const pxBottom = Math.min(tifH, Math.ceil((wf.originY - bbox.minY) / Math.abs(wf.pixelSizeY)));
            const cropW = pxRight - pxLeft;
            const cropH = pxBottom - pxTop;
            if (cropW <= 0 || cropH <= 0)
                return false;
            const stats = await (0, sharp_1.default)(tifPath)
                .extract({ left: pxLeft, top: pxTop, width: cropW, height: cropH })
                .stats();
            const depthBits = { uchar: 8, ushort: 16, uint: 32, float: 32 };
            const bits = depthBits[meta.depth ?? 'uchar'] ?? 8;
            const maxVal = Math.pow(2, bits) - 1;
            return stats.channels.some((ch) => ch.mean > maxVal * 0.02);
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
};
exports.CadastreService = CadastreService;
exports.CadastreService = CadastreService = __decorate([
    (0, common_1.Injectable)()
], CadastreService);
//# sourceMappingURL=cadastre.service.js.map