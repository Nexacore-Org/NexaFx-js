// src/common/interceptors/load-shedding.interceptor.ts
import { Injectable, NestInterceptor, HttpException, HttpStatus } from '@nestjs/common';
import * as os from 'os';

@Injectable()
export class LoadSheddingInterceptor implements NestInterceptor {
  private readonly CPU_THRESHOLD = 0.90; // 90% CPU limit

  intercept(context: ExecutionContext, next: CallHandler) {
    const load = os.loadavg()[0] / os.cpus().length;
    const request = context.switchToHttp().getRequest();
    const priority = request.headers['x-priority'] || 'low';

    if (load > this.CPU_THRESHOLD && priority === 'low') {
      throw new HttpException(
        'System is under heavy load. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return next.handle();
  }
}