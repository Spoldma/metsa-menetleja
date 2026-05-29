import { Observable } from 'rxjs';
import { CadastreService, SseEvent } from './cadastre.service';
export declare class CadastreController {
    private readonly cadastreService;
    constructor(cadastreService: CadastreService);
    analyze(code: string): Observable<SseEvent>;
}
