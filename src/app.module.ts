import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WahaController } from './waha/waha.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './waha/message.entity';
import { HttpModule } from '@nestjs/axios';
import { WahaGateway } from './waha/waha.gateway';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'mathias',
      password: 'mathias123',
      database: 'whatsapp_db',
      entities: [Message],
      synchronize: true, // Crea las tablitas
    }),
    TypeOrmModule.forFeature([Message]),
  ],
  controllers: [AppController, WahaController],
  providers: [AppService, WahaGateway],
})
export class AppModule {}
