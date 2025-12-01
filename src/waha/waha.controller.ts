import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const CHANNEL_ID = "120363405198767554@newsletter"

@Controller('api/waha')
export class WahaController {
  private readonly logger = new Logger(WahaController.name);

  constructor(
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    private readonly httpService: HttpService
  ) {}

  @Post('publish')
  async createPost(@Body() body: { text: string }) {
    if (!body || !body.text) {
      return { status: 'error', message: 'Missing "text" field' };
    }

    this.logger.log(`Publishing Post: ${body.text}`);

    const wahaUrl = 'http://host.docker.internal:3000/api/sendText';
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(wahaUrl, {
          session: 'default',
          chatId: CHANNEL_ID,
          text: body.text
        }, {
          headers: {
            'X-Api-Key': '942151dd19bc454084af2fb48c4d61ac',
            'Content-Type': 'application/json'
          }
        })
      );

      const createdMessageId = response.data.id; 

      this.logger.log(`WAHA accepted. Created ID: ${createdMessageId}`);

      const newMessage = this.messageRepo.create({
        whatsappId: createdMessageId,
        from: CHANNEL_ID,
        fromMe: true,
        body: body.text,
        status: 'sent',
      });

      await this.messageRepo.save(newMessage);
      this.logger.log(` Saved to DB directly from Publish endpoint`);
      
      return { status: 'success', message: 'Post saved and sent', id: createdMessageId };

    } catch (error) {
      this.logger.error('Failed to publish', error.response?.data || error.message);
      throw error;
    }
  }
  
  // Endpoint para wahahhihn
  @Post('webhook')
  async handleWebhook(@Body() payload: any) {

    this.logger.log(`Se recibió evento de Webhook: ${payload.event}`);

    // Según el evento hacer
    switch (payload.event) {
        case 'message':
            this.handleNewMessage(payload.payload);
            break;
        
        case 'message.revoked':
            this.handleMessageRevoked(payload.payload);
            break;

        case 'session.status':
            this.handleSessionStatus(payload.payload);
            break;
        case 'message.ack':
            this.handleMessageAck(payload.payload);
            break;

      default:
        this.logger.log('Unhandled event type');
    }

    // Retornar 200 para que waha sepa que se recibió
    return { status: 'received' };
  }

  private async handleNewMessage(data: any) {

    const realId = data.id?._serialized || data.id;

    this.logger.warn(` INCOMING MSG | From: '${data.from}' | ChannelTarget: '${CHANNEL_ID}' | RealID: ${realId}`);

    if (data.from !== CHANNEL_ID) {
      this.logger.warn(` SKIPPED: Message is from '${data.from}', but we only want '${CHANNEL_ID}'`);
      return; 
    }

    if (!data.body) {
        this.logger.warn(` SKIPPED: Message has no body text.`);
        return;
    }

    try {
      const newMessage = this.messageRepo.create({
        whatsappId: realId,
        from: data.from,
        fromMe: data.fromMe,
        body: data.body,
        status: 'published',
      });

      await this.messageRepo.save(newMessage);
      
      this.logger.log(` DATABASE SAVED: ${data.body} (ID: ${realId})`);
      
    } catch (error) {
      this.logger.error(` DATABASE ERROR: ${error.message}`, error.stack);
    }
  }

  private async handleMessageRevoked(data: any) {
    const idToDelete = data.after?.id || data.id;

    if (idToDelete) {
      
      const result = await this.messageRepo.delete({ whatsappId: idToDelete });
      
      if (result.affected as number > 0) {
        this.logger.log(`Deleted message: ${idToDelete}`);
        // TODO: Emit 'delete' event to WebSocket
      } else {
        this.logger.warn(`Could not find message to delete: ${idToDelete}`);
      }
    }
  }

  private async handleMessageAck(data: any) {
    const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read', 0: 'clock' };
    const newStatus = statusMap[data.ack] || 'unknown';

    const msgId = data.id?._serialized || data.id;

    if (msgId) {
      await this.messageRepo.update({ whatsappId: msgId }, { status: newStatus });
      this.logger.log(`✅ Status updated to '${newStatus}' for ${msgId}`);
      // TODO: Emit 'update' event to WebSocket
    }
  }
  private handleSessionStatus(payload: any) {
    this.logger.log(`Session Status: ${payload.status} | Session: ${payload.session}`);
  }
}

// Comando de Pwshell
// Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/waha/publish" `
//   -ContentType "application/json" `
//   -Body '{"text": "Hello PowerShell!"}'