import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { ErrorCodes } from '../errors/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly context: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const correlationId = this.context.getCorrelationId();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let response: any = {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Something went wrong',
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      response = {
        code: exceptionResponse.code || ErrorCodes.INTERNAL_ERROR,
        message:
          exceptionResponse.message || exception.message || 'Error occurred',
        timestamp: new Date().toISOString(),
        correlationId,
        details: exceptionResponse.details,
      };

      // Validation errors (class-validator)
      if (Array.isArray(exceptionResponse.message)) {
        response.code = ErrorCodes.VALIDATION_ERROR;
        response.details = exceptionResponse.message.map((err) => ({
          field: err.property,
          errors: Object.values(err.constraints || {}),
        }));
      }
    }

    // Hide stack traces in production
    if (process.env.NODE_ENV !== 'development') {
      delete response.stack;
    }

    res.status(status).json(response);
  }
}