import { Controller, Get, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CadastreService, SseEvent } from './cadastre.service';

@Controller('cadastre')
export class CadastreController {
  constructor(private readonly cadastreService: CadastreService) {}

  @Sse('analyze')
  analyze(@Query('code') code: string): Observable<SseEvent> {
    return this.cadastreService.analyze(code);
  }
}
