import { Test, TestingModule } from '@nestjs/testing';
import { CsrfService } from './csrf.service';

describe('CsrfService', () => {
  let service: CsrfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsrfService],
    }).compile();

    service = module.get<CsrfService>(CsrfService);
  });

  it('should generate unique tokens', () => {
    const token1 = service.generateToken('session1');
    const token2 = service.generateToken('session2');
    
    expect(token1).not.toBe(token2);
    expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it('should validate correct tokens', () => {
    const sessionId = 'test-session';
    const token = service.generateToken(sessionId);
    
    const isValid = service.validateToken(sessionId, token);
    expect(isValid).toBe(true);
  });

  it('should reject invalid tokens', () => {
    const sessionId = 'test-session';
    service.generateToken(sessionId);
    
    const isValid = service.validateToken(sessionId, 'invalid-token');
    expect(isValid).toBe(false);
  });

  it('should reject tokens for wrong session', () => {
    const token = service.generateToken('session1');
    
    const isValid = service.validateToken('session2', token);
    expect(isValid).toBe(false);
  });
});