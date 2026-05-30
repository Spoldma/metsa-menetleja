import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ValuationService } from './valuation.service';

@Controller('valuation')
export class ValuationController {
  constructor(private readonly valuationService: ValuationService) {}

  @Get('estimate')
  estimate(@Query('code') code: string) {
    if (!code?.trim()) {
      throw new BadRequestException('Katastritunnus on kohustuslik (nt 79501:027:0011)');
    }
    return this.valuationService.estimate(code.trim());
  }
}
