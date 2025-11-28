import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WahaController } from './waha/waha.controller';

@Module({
  imports: [],
  controllers: [AppController, WahaController],
  providers: [AppService],
})
export class AppModule {}
