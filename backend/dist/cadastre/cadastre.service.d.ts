import { Observable } from 'rxjs';
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
export declare class CadastreService {
    analyze(code: string): Observable<SseEvent>;
    private run;
}
