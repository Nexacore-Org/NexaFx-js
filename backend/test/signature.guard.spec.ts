import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SignatureGuard } from '../src/guards/signature.guard';
import * as crypto from 'crypto';

describe('SignatureGuard', () => {
  let guard: SignatureGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureGuard,
        {
            provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    guard = module.get<SignatureGuard>(SignatureGuard);
    configService = module.get<ConfigService>(ConfigService);
  });
  const createMockContext = (headers: any, rawBody: Buffer): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          rawBody,
        }),
      }),
    } as ExecutionContext;
  };
  const generateSignature = (body: string, secret: string): string => {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  };

  describe('canActivate', () => {
    it('should allow requests with valid signatures', async () => {
      const secret = 'test-secret';
      const body = JSON.stringify({ test: 'data' });
      const signature = generateSignature(body, secret);

      mockConfigService.get.mockReturnValue(secret);

      const context = createMockContext(
        { 'x-signature': signature },
        Buffer.from(body)
      );
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should reject requests with invalid signatures', async () => {
      const secret = 'test-secret';
      const body = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature';

      mockConfigService.get.mockReturnValue(secret);

      const context = createMockContext(
        { 'x-signature': invalidSignature },
        Buffer.from(body)
      );
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject requests without signatures', async () => {
      const body = JSON.stringify({ test: 'data' });

      const context = createMockContext({}, Buffer.from(body));

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
    it('should reject requests without body', async () => {
        const signature = 'some-signature';
  
        const context = createMockContext(
          { 'x-signature': signature },
          null
        );
        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle GitHub-style signatures', async () => {
      const secret = 'test-secret';
      const body = JSON.stringify({ test: 'data' });
      const signature = generateSignature(body, secret);

      mockConfigService.get.mockReturnValue(secret);

      const context = createMockContext(
        { 'x-hub-signature-256': `sha256=${signature}` },
        Buffer.from(body)
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});