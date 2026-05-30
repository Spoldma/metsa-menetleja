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
export interface ForestHeightStats {
    averageHeight: number;
    forestPixelCount: number;
    totalPixelCount: number;
    shares: {
        threshold: number;
        percentage: number;
    }[];
}
export interface ResourceFeature {
    type: string;
    geometry: {
        type: string;
        coordinates: number[][][] | number[][][][];
    };
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
    resourceFile?: string;
    resourceCount?: number;
    treeCount?: number;
    treePolygonPlot?: string;
}
export declare class CadastreService {
    analyze(code: string): Observable<SseEvent>;
    private run;
    private findKaardilehtIds;
    private getZipUrls;
    private isTifUsable;
    private downloadAndExtractTif;
    private findFile;
    private parseWorldFile;
    private patchGeoTags;
    private fetchNaturalResources;
    private getChmTifUrls;
    private readGeoTiffTransform;
    private extractChmHeights;
    private pointInPolygon;
    private callTreeDetectionApi;
    private computeHeightStats;
}
