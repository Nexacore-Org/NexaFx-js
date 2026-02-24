import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

export interface WsAuthenticatedSocket extends Socket {
  user: {
    sub: string;
    email: string;
    roles: string[];
    [key: string]: unknown;
  };
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new WsException('Missing authentication token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      (client as WsAuthenticatedSocket).user = payload;
      return true;
    } catch (err) {
      this.logger.warn(`WS JWT verification failed: ${err.message}`);
      throw new WsException('Invalid or expired token');
    }
  }

  private extractToken(client: Socket): string | null {
    // Try Authorization header first
    const authHeader =
      client.handshake?.headers?.authorization ||
      client.handshake?.auth?.token ||
      client.handshake?.query?.token;

    if (!authHeader) return null;

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return typeof authHeader === 'string' ? authHeader : null;
  }
}
