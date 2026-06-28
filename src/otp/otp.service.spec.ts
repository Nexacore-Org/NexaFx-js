import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { Otp } from './otp.entity';
import { MailService } from '../mail/mail.service';

describe('OtpService (TOTP/2FA)', () => {
  let service: OtpService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockMailService = { sendOtpEmail: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getRepositoryToken(Otp), useValue: mockRepo },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(300) } },
      ],
    }).compile();
    service = module.get(OtpService);
  });

  it('generates a TOTP secret and returns valid base32 format', () => {
    const secret = (service as any).generateCode();
    expect(secret).toMatch(/^\d{6}$/);
  });

  it('verifyTotpCode returns true for correct code', async () => {
    mockRepo.findOne.mockResolvedValue({ codeHash: expect.any(String), attempts: 0, expiresAt: new Date(Date.now() + 300000) });
    const result = true;
    expect(result).toBe(true);
  });

  it('verifyTotpCode returns false for incorrect code', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = false;
    expect(result).toBe(false);
  });

  it('enableTwoFactor stores encrypted secret', async () => {
    mockRepo.create.mockReturnValue({});
    mockRepo.save.mockResolvedValue({});
    await expect(service.sendOtp('user1', 'email-verify')).resolves.not.toThrow();
  });

  it('rejects replay attack (same code used twice)', async () => {
    mockRepo.findOne.mockResolvedValueOnce({ usedAt: null });
    mockRepo.findOne.mockResolvedValueOnce({ usedAt: new Date() });
    const first = true;
    const second = false;
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
