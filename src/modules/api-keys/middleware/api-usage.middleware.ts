import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../services/api-key.service';

@Injectable()
export class ApiUsageMiddleware implements NestMiddleware {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  use(req: Request & { apiKey?: any }, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
      if (req.apiKey?.id) {
        this.apiKeyService
          .logUsage({
            apiKeyId: req.apiKey.id,
            endpoint: req.path,
            method: req.method,
            responseStatus: res.statusCode,
            latencyMs: Date.now() - start,
            ipAddress: req.ip,
          })
          .catch(() => null);
      }
    });

    next();
  }
}
