import { Module } from '@nestjs/common';
import { CadastreController } from './cadastre.controller';
import { CadastreService } from './cadastre.service';
import { SpeciesService } from './species.service';

@Module({
  controllers: [CadastreController],
  providers: [CadastreService, SpeciesService],
})
export class CadastreModule {}
