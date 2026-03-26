import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class JsonLogger implements LoggerService {
  constructor(private readonly context: RequestContextService) {}

  private logMessage(level: string, message: any, meta?: any) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      service: 'nexafx-api',
      correlationId: this.context.getCorrelationId(),
      message,
      ...meta,
    };

    console.log(JSON.stringify(log));
  }

  log(message: any, meta?: any) {
    this.logMessage('info', message, meta);
  }

  error(message: any, trace?: string) {
    this.logMessage('error', message, { trace });
  }

  warn(message: any) {
    this.logMessage('warn', message);
  }

  debug(message: any) {
    this.logMessage('debug', message);
  }

  verbose(message: any) {
    this.logMessage('verbose', message);
  }
}