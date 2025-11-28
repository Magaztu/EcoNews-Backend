import { Controller, Post, Body, Logger } from '@nestjs/common';

@Controller('api/waha')
export class WahaController {
  private readonly logger = new Logger(WahaController.name);

  // Endpoint para wahahhihn
  @Post('webhook')
  handleWebhook(@Body() payload: any) {
    
    this.logger.log(`Se recibió evento de Webhook: ${payload.event}`);
    
    // Según el evento hacer
    switch (payload.event) {
      case 'message':
        this.handleNewMessage(payload.payload);
        break;
        
      case 'message.revoked':
        this.handleMessageRevoked(payload.payload);
        break;

      default:
        this.logger.log('Unhandled event type');
    }

    // Retornar 200 para que waha sepa que se recibió
    return { status: 'received' };
  }

  private handleNewMessage(data: any) {
    // Guardado a la DB
    const message = {
      whatsappId: data.id,
      from: data.from,
      body: data.body,
      timestamp: data.timestamp,
      hasMedia: data.hasMedia
    };
    
    this.logger.log(`📩 New Message from ${message.from}: ${message.body}`);
    // TODO: Save to DB
    // TODO: Emit to WebSocket
  }

  private handleMessageRevoked(data: any) {
    // Borrar según ID
    this.logger.log(`🗑️ Message Deleted: ${data.after.id}`); 
    // TODO: Delete from DB
    // TODO: Emit delete event to WebSocket
  }
}