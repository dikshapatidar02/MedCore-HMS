import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Inject, Logger } from "@nestjs/common";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/notifications",
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const authHeader =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization as string);

      if (!authHeader) {
        this.logger.warn(`Rejected unauthenticated socket connection: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const token = authHeader.replace(/^Bearer\s+/i, "");
      const secret = process.env.JWT_ACCESS_SECRET || "access_secret_medcore_hms";
      const payload = this.jwtService.verify(token, { secret });

      client.data.user = payload;

      // Automatically join strictly scoped rooms
      const userRoom = `user_${payload.sub}`;
      client.join(userRoom);

      if (payload.hospitalId) {
        const hospitalRoom = `hospital_${payload.hospitalId}`;
        client.join(hospitalRoom);
      }

      this.logger.log(
        `Socket authenticated: user=${payload.sub}, hospital=${payload.hospitalId}`
      );
    } catch (err: any) {
      this.logger.warn(`Socket authentication failed: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage("join_room")
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string }
  ) {
    const user = client.data.user;
    if (!user) {
      throw new WsException("Unauthorized socket session.");
    }

    const permittedRooms = [`user_${user.sub}`];
    if (user.hospitalId) {
      permittedRooms.push(`hospital_${user.hospitalId}`);
    }

    if (!permittedRooms.includes(data.room)) {
      this.logger.warn(
        `Security violation: User ${user.sub} attempted to join unauthorized room ${data.room}`
      );
      throw new WsException(
        `Unauthorized room: Access denied to room '${data.room}'. Cross-tenant room joining is prohibited.`
      );
    }

    client.join(data.room);
    return { status: "JOINED", room: data.room };
  }

  sendToUser(userId: string, event: string, payload: any) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit(event, payload);
    }
  }

  sendToHospital(hospitalId: string, event: string, payload: any) {
    if (this.server) {
      this.server.to(`hospital_${hospitalId}`).emit(event, payload);
    }
  }
}
