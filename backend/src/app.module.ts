import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CadastreModule } from './cadastre/cadastre.module';
import { ValuationModule } from './valuation/valuation.module';

@Module({
  imports: [CadastreModule, ValuationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
