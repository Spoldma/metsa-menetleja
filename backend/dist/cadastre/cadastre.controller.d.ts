import type { Response } from 'express';
import { Observable } from 'rxjs';
import { CadastreService, SseEvent } from './cadastre.service';
import { SpeciesService } from './species.service';
export declare class CadastreController {
    private readonly cadastreService;
    private readonly speciesService;
    constructor(cadastreService: CadastreService, speciesService: SpeciesService);
    analyze(code: string): Observable<SseEvent>;
    downloadTif(filename: string, res: Response): void;
    analyzeSpecies(filename: string): Promise<import("./species.service").SpeciesRatios>;
}
