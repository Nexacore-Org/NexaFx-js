import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { I18nService, SupportedLanguage } from "../../i18n/i18n.service";

export interface LocalizedErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  language: string;
}

@Catch()
export class LocalizedExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18nService: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const language = (request.language || "en") as SupportedLanguage;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let messageKey = "error.internal_server";
    let params: Record<string, any> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === "object" &&
        "messageKey" in exceptionResponse
      ) {
        messageKey = (exceptionResponse as any).messageKey;
        params = (exceptionResponse as any).params || {};
      } else if (typeof exceptionResponse === "string") {
        messageKey = exceptionResponse;
      } else if (
        typeof exceptionResponse === "object" &&
        "message" in exceptionResponse
      ) {
        const msg = (exceptionResponse as any).message;
        messageKey = Array.isArray(msg) ? msg[0] : msg;
      }
    }

    const localizedMessage = this.i18nService.translate(
      messageKey,
      language,
      params,
    );

    const errorResponse: LocalizedErrorResponse = {
      statusCode: status,
      message: localizedMessage,
      error: HttpStatus[status] || "Error",
      timestamp: new Date().toISOString(),
      path: request.url,
      language,
    };

    response.status(status).json(errorResponse);
  }
}
