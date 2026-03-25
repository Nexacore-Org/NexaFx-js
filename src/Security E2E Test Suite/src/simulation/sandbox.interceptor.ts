import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs'; // 'of' must be imported from rxjs

@Injectable()
export class SandboxInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Short-circuit when sandbox mode header is present
    if (request.headers['x-sandbox-mode'] === 'true') {
      return of({ sandbox: true, message: 'Request intercepted in sandbox mode' });
    }

    return next.handle();
  }
}
