"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CadastreService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const rxjs_1 = require("rxjs");
const CADASTRE_API = 'https://kolvikud.kataster.ee/api/cadastre-unit/find?date=2024-02-01&code=';
const WMS_BASE = 'https://xgis.maaamet.ee/xgis2/service/17bup8p?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&FORMAT=image%2Fjpeg&STYLES=&TRANSPARENT=TRUE&LAYERS=cir_ngr&SRS=EPSG%3A3301';
const MAX_IMG_PX = 800;
const PADDING_RATIO = 0.05;
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
        if (!items?.length) {
            throw new Error(`Katastriüksust ei leitud: ${code}`);
        }
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
        const rawMinX = Math.min(...xs);
        const rawMaxX = Math.max(...xs);
        const rawMinY = Math.min(...ys);
        const rawMaxY = Math.max(...ys);
        const padX = (rawMaxX - rawMinX) * PADDING_RATIO;
        const padY = (rawMaxY - rawMinY) * PADDING_RATIO;
        const bbox = {
            minX: rawMinX - padX,
            maxX: rawMaxX + padX,
            minY: rawMinY - padY,
            maxY: rawMaxY + padY,
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
        const toPixel = (c) => [
            Math.round(((c[0] - bbox.minX) / bboxW) * imgW),
            Math.round(((bbox.maxY - c[1]) / bboxH) * imgH),
        ];
        const points = ring
            .map(toPixel)
            .map(([px, py]) => `${px},${py}`)
            .join(' ');
        const svgMask = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
      <polygon points="${points}" fill="white"/>
    </svg>`;
        const clippedBuffer = await (0, sharp_1.default)(wmsBuffer)
            .png()
            .composite([{ input: Buffer.from(svgMask), blend: 'dest-in' }])
            .toBuffer();
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
            clippedImage: clippedBuffer.toString('base64'),
        };
        emit(subject, 'complete', 'Analüüs valmis!', result);
        subject.complete();
    }
};
exports.CadastreService = CadastreService;
exports.CadastreService = CadastreService = __decorate([
    (0, common_1.Injectable)()
], CadastreService);
//# sourceMappingURL=cadastre.service.js.map