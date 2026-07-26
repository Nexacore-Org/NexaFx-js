import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class SwaggerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
  }
}
