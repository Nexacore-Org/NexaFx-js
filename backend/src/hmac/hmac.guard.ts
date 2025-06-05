import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const HMAC_REQUIRED_KEY = 'hmacRequired';

@Injectable()
export class HmacGuard implements CanActivate {
  private readonly logger = new Logger(HmacGuard.name);

  constructor(
    private hmacService: HmacService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const isHmacRequired = this.reflector.getAllAndOverride<boolean>(
      HMAC_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isHmacRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const signature = this.extractSignatureFromRequest(request);
    const payload = this.getRequestPayload(request);

    if (!signature) {
      this.logger.warn('Missing HMAC signature in request');
      throw new BadRequestException('HMAC signature required');
    }

    if (!payload) {
      this.logger.warn('Empty request payload for HMAC verification');
      throw new BadRequestException('Request payload required for HMAC verification');
    }

    const isValid = this.hmacService.verifySignature(payload, signature);
    
    if (!isValid) {
      this.logger.warn('Invalid HMAC signature detected', {
        method: request.method,
        url: request.url,
        signature: signature.substring(0, 8) + '...' // Log partial signature for debugging
      });
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    this.logger.debug('HMAC signature verified successfully');
    return true;
  }

  private extractSignatureFromRequest(request: Request): string | null {
    // Try multiple header variations
    const headers = [
      'x-signature',
      'x-hmac-signature',
      'x-hub-signature-256',
      'signature'
    ];

    for (const header of headers) {
      const value = request.headers[header] as string;
      if (value) {
        return this.hmacService.extractSignature(value);
      }
    }

    return null;
  }

  private getRequestPayload(request: Request): string | null {
    if (request.method === 'GET') {
      // For GET requests, use query string
      return new URLSearchParams(request.query as any).toString();
    }
    
    // For POST/PUT/PATCH, use raw body
    if (request.body) {
      if (typeof request.body === 'string') {
        return request.body;
      }
      return JSON.stringify(request.body);
    }
    
    return null;
  }
}
