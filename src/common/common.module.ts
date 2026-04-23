import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './context/request-context.service';
import { JsonLogger } from './logging/json-logger';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';

@Global()
@Module({
  providers: [RequestContextService, JsonLogger, LoggingInterceptor, CorrelationIdMiddleware],
  exports: [RequestContextService, JsonLogger, LoggingInterceptor, CorrelationIdMiddleware],
})
export class CommonModule {}
