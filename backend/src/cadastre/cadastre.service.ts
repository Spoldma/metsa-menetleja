import { Injectable } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';
import { Observable, Subject } from 'rxjs';

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
}

const CADASTRE_API =
  'https://kolvikud.kataster.ee/api/cadastre-unit/find?date=2024-02-01&code=';
const WMS_BASE =
  'https://xgis.maaamet.ee/xgis2/service/17bup8p?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&FORMAT=image%2Fjpeg&STYLES=&TRANSPARENT=TRUE&LAYERS=cir_ngr&SRS=EPSG%3A3301';
const MAX_IMG_PX = 800;
const PADDING_RATIO = 0.05;

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
    if (!items?.length) {
      throw new Error(`Katastriüksust ei leitud: ${code}`);
    }

    const item = items[0];

    // geometry is a JSON string embedded in the response
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
    const rawMinX = Math.min(...xs);
    const rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);

    const padX = (rawMaxX - rawMinX) * PADDING_RATIO;
    const padY = (rawMaxY - rawMinY) * PADDING_RATIO;
    const bbox: BBox = {
      minX: rawMinX - padX,
      maxX: rawMaxX + padX,
      minY: rawMinY - padY,
      maxY: rawMaxY + padY,
    };

    // Step 3 – download WMS image
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

    // Step 4 – clip image to polygon
    emit(subject, 'clipping', 'Lõikan katastriüksust...');
    const toPixel = (c: number[]): [number, number] => [
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

    const clippedBuffer = await sharp(wmsBuffer)
      .png()
      .composite([{ input: Buffer.from(svgMask), blend: 'dest-in' }])
      .toBuffer();

    // Step 5 – done
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
      clippedImage: clippedBuffer.toString('base64'),
    };

    emit(subject, 'complete', 'Analüüs valmis!', result);
    subject.complete();
  }
}

interface CadastreApiItem {
  id: number;
  code: string;
  address: { shortAddress: string; adsLevel1: string; adsLevel2: string; adsLevel3: string };
  area: number;
  geometry: string; // JSON-encoded polygon string
}
