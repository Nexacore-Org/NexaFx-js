import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.headers['content-type']?.includes('application/json')) {
      let rawBody = '';
      
      req.on('data', (chunk) => {
        rawBody += chunk.toString();
      });
      
      req.on('end', () => {
        (req as any).rawBody = rawBody;
        if (rawBody) {
          try {
            req.body = JSON.parse(rawBody);
          } catch (error) {
            // Invalid JSON, let NestJS handle the error
          }
        }
        next();
      });
    } else {
      next();
    }
  }
}