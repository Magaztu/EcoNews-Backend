import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ 
  cors: { origin: '*' } // Cualquiera puede acceder a la API
})
export class WahaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('WebSocket');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // PUshea un post
  notifyNewPost(post: any) {
    this.server.emit('new_post', post);
  }

  // Pushea actus
  notifyStatusUpdate(update: any) {
    this.server.emit('post_update', update);
  }
}