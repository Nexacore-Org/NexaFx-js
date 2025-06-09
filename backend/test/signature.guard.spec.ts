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