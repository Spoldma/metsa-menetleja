import { Controller, Get, Param, Query, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { Observable } from 'rxjs';
import { CadastreService, SseEvent } from './cadastre.service';
import { SpeciesService } from './species.service';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

@Controller('cadastre')
export class CadastreController {
  constructor(
    private readonly cadastreService: CadastreService,
    private readonly speciesService: SpeciesService,
  ) {}

  @Sse('analyze')
  analyze(@Query('code') code: string): Observable<SseEvent> {
    return this.cadastreService.analyze(code);
  }

  @Get('tif/:filename')
  downloadTif(@Param('filename') filename: string, @Res() res: Response): void {
    const safe = path.basename(filename);
    res.download(path.join(OUTPUT_DIR, safe));
  }

  @Get('species/:filename')
  analyzeSpecies(@Param('filename') filename: string) {
    return this.speciesService.analyzeSpecies(filename);
  }
}
