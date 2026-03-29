import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  Logger,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';

import { WsJwtGuard, WsAuthenticatedSocket } from './guards/ws-jwt.guard';
import { WsLoggingInterceptor } from './interceptors/ws-logging.interceptor';
import { NotificationsService } from './notifications.service';
import { NotificationsPersistenceService } from './notifications-persistence.service';
import { NotificationCenterService } from '../modules/notifications/services/notification-center.service';
import { MissedEventsRequestDto, SubscribeChannelDto } from './dto/notification.dto';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  WS_NAMESPACE,
  MAX_ROOM_SUBSCRIPTIONS,
  WALLET_BALANCE_DEBOUNCE_MS,
} from './notifications.constants';

@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10_000,
  pingTimeout: 5_000,
})
@UseInterceptors(WsLoggingInterceptor)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  private readonly socketUserMap = new Map<string, string>();
  private readonly userSocketsMap = new Map<string, Set<string>>();
  private readonly socketRoomsMap = new Map<string, Set<string>>();
  private readonly walletDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly persistence: NotificationsPersistenceService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationCenterService: NotificationCenterService,
  ) {}

  afterInit(server: Server): void {
    this.notificationsService.setServer(server);
    this.notificationCenterService.setServer(server);
    this.logger.log(`WebSocket gateway initialized on namespace "${WS_NAMESPACE}"`);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authenticateHandshake(client);
      (client as WsAuthenticatedSocket).user = user;

      const userId = user.sub;
      this.registerSocket(client.id, userId);

      await client.join(NOTIFICATION_CHANNELS.USER(userId));

      if (user.roles?.includes('admin') || user.roles?.includes('super_admin')) {
        await client.join(NOTIFICATION_CHANNELS.ADMIN());
        await client.join(NOTIFICATION_CHANNELS.FRAUD());
      }

      client.emit(NOTIFICATION_EVENTS.CONNECTION_ACK, {
        socketId: client.id,
        userId,
        connectedAt: new Date().toISOString(),
        channels: this.getClientRooms(client),
      });

      this.logger.log(
        `Client connected: ${client.id} (user=${userId}, sockets=${this.userSocketsMap.get(userId)?.size})`,
      );
    } catch (err) {
      this.logger.warn(`Rejected connection ${client.id}: ${err.message}`);
      client.emit('exception', { message: err.message });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.socketUserMap.get(client.id);
    if (userId) {
      this.deregisterSocket(client.id, userId);
      this.logger.log(
        `Client disconnected: ${client.id} (user=${userId}, remaining=${this.userSocketsMap.get(userId)?.size ?? 0})`,
      );
    }
  }

  // ─── Message handlers ─────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe_channel')
  async handleSubscribeChannel(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: SubscribeChannelDto,
  ): Promise<{ success: boolean; channel: string }> {
    const allowed = this.isChannelAllowed(client.user, dto.channel);
    if (!allowed) {
      throw new WsException(`Not authorized to subscribe to channel: ${dto.channel}`);
    }
    await client.join(dto.channel);
    this.logger.debug(`${client.user.sub} joined channel ${dto.channel}`);
    return { success: true, channel: dto.channel };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe_room')
  async handleSubscribeRoom(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: SubscribeChannelDto,
  ): Promise<{ success: boolean; room: string }> {
    const allowed = this.isChannelAllowed(client.user, dto.channel);
    if (!allowed) {
      throw new WsException(`Not authorized to subscribe to room: ${dto.channel}`);
    }

    const rooms = this.socketRoomsMap.get(client.id) ?? new Set<string>();
    if (rooms.size >= MAX_ROOM_SUBSCRIPTIONS) {
      throw new WsException(`Maximum room subscriptions (${MAX_ROOM_SUBSCRIPTIONS}) reached`);
    }

    await client.join(dto.channel);
    rooms.add(dto.channel);
    this.socketRoomsMap.set(client.id, rooms);
    this.logger.debug(`${client.user.sub} subscribed to room ${dto.channel}`);
    return { success: true, room: dto.channel };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe_room')
  async handleUnsubscribeRoom(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: SubscribeChannelDto,
  ): Promise<{ success: boolean; room: string }> {
    await client.leave(dto.channel);
    this.socketRoomsMap.get(client.id)?.delete(dto.channel);
    this.logger.debug(`${client.user.sub} unsubscribed from room ${dto.channel}`);
    return { success: true, room: dto.channel };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe_channel')
  async handleUnsubscribeChannel(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: SubscribeChannelDto,
  ): Promise<{ success: boolean; channel: string }> {
    await client.leave(dto.channel);
    this.socketRoomsMap.get(client.id)?.delete(dto.channel);
    return { success: true, channel: dto.channel };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('request_missed_events')
  async handleMissedEvents(
    @ConnectedSocket() client: WsAuthenticatedSocket,
    @MessageBody() dto: MissedEventsRequestDto,
  ): Promise<void> {
    const since = new Date(dto.since);
    const limit = dto.limit ?? 50;
    await this.notificationsService.deliverMissedEvents(client.user.sub, since, limit);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ping')
  handlePing(
    @ConnectedSocket() client: WsAuthenticatedSocket,
  ): { event: string; timestamp: string } {
    return { event: 'pong', timestamp: new Date().toISOString() };
  }

  // ─── Scheduled heartbeat ──────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  sendHeartbeats(): void {
    if (!this.server) return;
    this.server.emit(NOTIFICATION_EVENTS.HEARTBEAT, {
      timestamp: new Date().toISOString(),
      connections: this.socketUserMap.size,
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async pruneExpiredNotifications(): Promise<void> {
    await this.persistence.pruneExpired();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getOnlineUserCount(): number {
    return this.userSocketsMap.size;
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userSocketsMap.get(userId);
    return !!sockets && sockets.size > 0;
  }

  getConnectedSocketCount(): number {
    return this.socketUserMap.size;
  }

  emitDashboardAlert(payload: Record<string, unknown>): void {
    this.server?.to(NOTIFICATION_CHANNELS.ADMIN()).emit(
      NOTIFICATION_EVENTS.DASHBOARD_ALERT,
      {
        event: NOTIFICATION_EVENTS.DASHBOARD_ALERT,
        payload,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // ─── Fraud Events ─────────────────────────────────────────────────────────
  @OnEvent('fraud.flagged')
  handleFraudFlagged(payload: Record<string, any>): void {
    this.server?.to(NOTIFICATION_CHANNELS.ADMIN()).emit('fraud.flagged', {
      event: 'fraud.flagged',
      payload,
      timestamp: new Date().toISOString(),
    });
    this.server?.to(NOTIFICATION_CHANNELS.FRAUD()).emit(NOTIFICATION_EVENTS.FRAUD_ALERT, {
      event: NOTIFICATION_EVENTS.FRAUD_ALERT,
      payload,
      timestamp: new Date().toISOString(),
    });

    // Emit high risk event if riskScore >= 81
    if (payload['riskScore'] && payload['riskScore'] >= 81) {
      this.server?.to(NOTIFICATION_CHANNELS.ADMIN()).emit('fraud.highRisk', {
        event: 'fraud.highRisk',
        payload,
        timestamp: new Date().toISOString(),
      });
      this.logger.warn(
        `High risk fraud transaction flagged (score=${payload['riskScore']}, txId=${payload['transactionId']})`,
      );
    }
  }

  @OnEvent('flag.updated')
  handleFlagUpdated(payload: Record<string, unknown>): void {
    this.server?.to(NOTIFICATION_CHANNELS.ADMIN()).emit('flag.updated', {
      event: 'flag.updated',
      payload,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`Emitted flag.updated to admin channel for flag: ${payload['flagName']}`);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async authenticateHandshake(
    client: Socket,
  ): Promise<{ sub: string; email: string; roles: string[]; [key: string]: unknown }> {
    const authHeader =
      client.handshake?.headers?.authorization ||
      client.handshake?.auth?.token ||
      (client.handshake?.query?.token as string);

    if (!authHeader) throw new WsException('No token provided');

    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

    return this.jwtService.verifyAsync(String(token), {
      secret: this.configService.get<string>('JWT_SECRET'),
    });
  }

  private registerSocket(socketId: string, userId: string): void {
    this.socketUserMap.set(socketId, userId);
    if (!this.userSocketsMap.has(userId)) {
      this.userSocketsMap.set(userId, new Set());
    }
    this.userSocketsMap.get(userId)!.add(socketId);
  }

  private deregisterSocket(socketId: string, userId: string): void {
    this.socketUserMap.delete(socketId);
    this.socketRoomsMap.delete(socketId);
    const sockets = this.userSocketsMap.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) this.userSocketsMap.delete(userId);
    }
  }

  private isChannelAllowed(
    user: WsAuthenticatedSocket['user'],
    channel: string,
  ): boolean {
    if (channel === NOTIFICATION_CHANNELS.USER(user.sub)) return true;
    if (
      channel === NOTIFICATION_CHANNELS.ADMIN() ||
      channel === NOTIFICATION_CHANNELS.FRAUD()
    ) {
      return user.roles?.some((r) => ['admin', 'super_admin'].includes(r)) ?? false;
    }
    if (channel.startsWith('transaction:')) {
      if (user.roles?.some((r) => ['admin', 'super_admin'].includes(r))) return true;
      return true;
    }
    if (channel.startsWith('wallet:')) {
      if (user.roles?.some((r) => ['admin', 'super_admin'].includes(r))) return true;
      return true;
    }
    return false;
  }

  private getClientRooms(client: Socket): string[] {
    return Array.from(client.rooms).filter((r) => r !== client.id);
  }
}
