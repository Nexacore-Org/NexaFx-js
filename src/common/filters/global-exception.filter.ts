import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { ErrorCodes } from '../errors/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContextService,
    @Optional() private readonly errorAnalytics?: { recordError(code: string): Promise<void> },
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const correlationId = this.context.getCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let message = 'Something went wrong';
    let details: any;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      code = exceptionResponse.code || this.statusToCode(status);
      message = typeof exceptionResponse.message === 'string'
        ? exceptionResponse.message
        : exception.message || 'Error occurred';
      details = exceptionResponse.details;

      // class-validator ValidationPipe produces { message: ValidationError[], statusCode: 400 }
      if (Array.isArray(exceptionResponse.message)) {
        code = ErrorCodes.VALIDATION_ERROR;
        message = 'Validation failed';
        details = exceptionResponse.message.map((err: any) => {
          if (typeof err === 'string') return { field: 'unknown', errors: [err] };
          return {
            field: err.property,
            errors: Object.values(err.constraints || {}),
          };
        });
      }
    }

    // Record error analytics asynchronously (non-blocking)
    if (this.errorAnalytics) {
      this.errorAnalytics.recordError(code).catch(() => {});
    }

    const body: Record<string, any> = {
      code,
      message,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (details !== undefined) {
      body.details = details;
    }

    // Never expose stack traces in production
    if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
      body.stack = exception.stack;
    }

    res.status(status).json(body);
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400: return ErrorCodes.VALIDATION_ERROR;
      case 401: return ErrorCodes.AUTH_001;
      case 403: return ErrorCodes.FORBIDDEN;
      case 404: return ErrorCodes.NOT_FOUND;
      default: return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
