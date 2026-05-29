import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CadastreModule } from './cadastre/cadastre.module';

@Module({
  imports: [CadastreModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
