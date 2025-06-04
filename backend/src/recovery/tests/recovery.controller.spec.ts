import { Test, TestingModule } from '@nestjs/testing';
import { RecoveryController } from '../recovery.controller';
import { RecoveryService } from '../recovery.service';

describe('RecoveryController', () => {
  let controller: RecoveryController;
  let service: RecoveryService;

  const mockRecoveryService = {
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    validateToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecoveryController],
      providers: [
        {
          provide: RecoveryService,
          useValue: mockRecoveryService,
        },
      ],
    }).compile();

    controller = module.get<RecoveryController>(RecoveryController);
    service = module.get<RecoveryService>(RecoveryService);
  });

  describe('requestPasswordReset', () => {
    it('should request password reset', async () => {
      const dto = { email: 'test@example.com' };
      const expectedResult = {
        message: 'Reset instructions sent',
        token: 'mock-token',
      };

      mockRecoveryService.requestPasswordReset.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.requestPasswordReset(dto);

      expect(result).toBe(expectedResult);
      expect(service.requestPasswordReset).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const dto = { token: 'valid-token', newPassword: 'NewPassword123!' };
      const expectedResult = { message: 'Password reset successful' };

      mockRecoveryService.resetPassword.mockResolvedValue(expectedResult);

      const result = await controller.resetPassword(dto);

      expect(result).toBe(expectedResult);
      expect(service.resetPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('validateToken', () => {
    it('should validate token', async () => {
      const token = 'valid-token';
      const expectedResult = { valid: true, email: 'test@example.com' };

      mockRecoveryService.validateToken.mockResolvedValue(expectedResult);

      const result = await controller.validateToken(token);

      expect(result).toBe(expectedResult);
      expect(service.validateToken).toHaveBeenCalledWith(token);
    });
  });
});
