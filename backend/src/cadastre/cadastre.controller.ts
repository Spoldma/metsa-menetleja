import { Controller, Get, Param, Query, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import { Observable } from 'rxjs';
import { CadastreService, SseEvent } from './cadastre.service';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

@Controller('cadastre')
export class CadastreController {
  constructor(private readonly cadastreService: CadastreService) {}

  @Sse('analyze')
  analyze(@Query('code') code: string): Observable<SseEvent> {
    return this.cadastreService.analyze(code);
  }

  @Get('tif/:filename')
  downloadTif(@Param('filename') filename: string, @Res() res: Response): void {
    const safe = path.basename(filename);
    res.download(path.join(OUTPUT_DIR, safe));
  }

  @Get('resources/:filename')
  getResources(@Param('filename') filename: string, @Res() res: Response): void {
    const safe = path.basename(filename);
    res.sendFile(path.join(OUTPUT_DIR, 'resources', safe));
  }
}
