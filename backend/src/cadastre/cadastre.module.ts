import { Module } from '@nestjs/common';
import { CadastreController } from './cadastre.controller';
import { CadastreService } from './cadastre.service';

@Module({
  controllers: [CadastreController],
  providers: [CadastreService],
})
export class CadastreModule {}
