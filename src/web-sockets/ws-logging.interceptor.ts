import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { WsAuthenticatedSocket } from '../guards/ws-jwt.guard';

@Injectable()
export class WsLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('WebSocket');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const client = context.switchToWs().getClient<WsAuthenticatedSocket>();
    const data = context.switchToWs().getData();
    const handler = context.getHandler().name;
    const userId = client.user?.sub ?? 'anonymous';
    const start = Date.now();

    this.logger.debug(`[${userId}] -> ${handler} | data=${JSON.stringify(data)}`);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.debug(
            `[${userId}] <- ${handler} | ${Date.now() - start}ms`,
          );
        },
        error: (err) => {
          this.logger.error(
            `[${userId}] !! ${handler} | ${err.message} | ${Date.now() - start}ms`,
          );
        },
      }),
    );
  }
}
