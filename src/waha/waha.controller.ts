import { Controller, Post, Body, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Get } from '@nestjs/common';
import { WahaGateway } from './waha.gateway';

const CHANNEL_ID = "120363405198767554@newsletter"

@Controller('api/waha')
export class WahaController {
  private readonly logger = new Logger(WahaController.name);

  constructor(
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    private readonly httpService: HttpService,
    private readonly wahaGateway: WahaGateway
  ) {}

  @Get('posts') // Endpoint para android
  async getPosts() {
    // 50 Posts más recientes, en orden desc como db
    return this.messageRepo.find({
      order: { createdAt: 'DESC' },
      take: 50
    });
  }

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

    //   const createdMessageId = response.data.id; 
      const rawId = response.data.id; 
      const finalId = rawId._serialized || rawId;

      this.logger.log(`WAHA accepted. Created ID: ${finalId}`);

      const newMessage = this.messageRepo.create({
        whatsappId: finalId,
        from: CHANNEL_ID,
        fromMe: true,
        body: body.text,
        status: 'sent',
      });

      const savedMessage = await this.messageRepo.save(newMessage);
      this.logger.log(` Saved to DB directly from Publish endpoint`);

      this.wahaGateway.notifyNewPost(savedMessage);
      
      return { status: 'success', message: 'Post saved and sent', id: finalId };

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
        
        case 'message.create':
            await this.handleNewMessage(payload.payload);
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
      const exists = await this.messageRepo.findOne({ where: { whatsappId: realId } });
      if (exists) {
        this.logger.debug(`Skipping duplicate message: ${realId}`);
        return;
      }

      const newMessage = this.messageRepo.create({
        whatsappId: realId,
        from: data.from,
        fromMe: data.fromMe,
        body: data.body,
        status: 'published',
      });

      const savedMessage = await this.messageRepo.save(newMessage);
      
      this.logger.log(` DATABASE SAVED: ${data.body} (ID: ${realId})`);

      this.wahaGateway.notifyNewPost(savedMessage);
      
    } catch (error) {
      if (error.code !== '23505') { // ignorar replicas por mis mensajes
          this.logger.error(`DATABASE ERROR: ${error.message}`);
      }
    }
  }

  private async handleMessageRevoked(data: any) {
    const rawId = data.after?.id || data.id;
    const idToDelete = rawId?._serialized || rawId;

    this.logger.log(`Webhook asked to delete: ${idToDelete}`);

    if (!idToDelete) return;

    const result = await this.messageRepo.delete({ whatsappId: idToDelete });
    
    if (result.affected as number > 0) {
      this.logger.log(`Deleted exact match: ${idToDelete}`);
      this.wahaGateway.server.emit('post_deleted', { id: idToDelete });
      return;
    } 

    this.logger.warn(` Exact ID not found. Trying to find the most recent orphan message...`);

    const lastMessage = await this.messageRepo.findOne({
        where: { 
            from: CHANNEL_ID, // Solo edl canal
            fromMe: true      // Solo from me
        },
        order: { createdAt: 'DESC' }
    });

    if (lastMessage) {
        this.logger.log(` Found a likely match by context: ${lastMessage.body} (ID: ${lastMessage.whatsappId})`);
        
        await this.messageRepo.delete({ whatsappId: lastMessage.whatsappId });
        
        this.wahaGateway.server.emit('post_deleted', { id: lastMessage.whatsappId });
        this.logger.log(` Deleted via Fallback!`);
    } else {
        this.logger.error(` Could not find any message to delete.`);
    }
  }

  private async handleMessageAck(data: any) {
    const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read', 0: 'clock' };
    const newStatus = statusMap[data.ack] || 'unknown';

    const msgId = data.id?._serialized || data.id;

    if (msgId) {
      await this.messageRepo.update({ whatsappId: msgId }, { status: newStatus });
      this.logger.log(`✅ Status updated to '${newStatus}' for ${msgId}`);
      this.wahaGateway.notifyStatusUpdate({ 
        id: msgId, 
        status: newStatus 
      });
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

//docker exec -it whatsapp_db psql -U mathias -d whatsapp_db -c "SELECT * FROM message;"