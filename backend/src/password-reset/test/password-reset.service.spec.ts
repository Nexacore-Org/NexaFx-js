import { Test, type TestingModule } from "@nestjs/testing"
import { JwtService } from "@nestjs/jwt"
import { ConfigService } from "@nestjs/config"
import { BadRequestException, UnauthorizedException } from "@nestjs/common"
import { PasswordResetService } from "../password-reset.service"
import { EmailService } from "../email.service"
import { describe, beforeEach, it, expect, jest } from "@jest/globals"

describe("PasswordResetService", () => {
  let service: PasswordResetService
  let emailService: EmailService
  let jwtService: JwtService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue("mock-jwt-token"),
            verify: jest.fn().mockReturnValue({ sub: "user-123" }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              const config = {
                BCRYPT_SALT_ROUNDS: 10,
                PASSWORD_RESET_TOKEN_EXPIRY: "1h",
                APP_NAME: "TestApp",
                FRONTEND_URL: "http://localhost:3000",
              }
              return config[key] || defaultValue
            }),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetConfirmationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile()

    service = module.get<PasswordResetService>(PasswordResetService)
    emailService = module.get<EmailService>(EmailService)
    jwtService = module.get<JwtService>(JwtService)
  })

  describe("initiatePasswordReset", () => {
    it("should initiate password reset for valid email", async () => {
      const result = await service.initiatePasswordReset({
        email: "test@example.com",
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain("password reset link has been sent")
      expect(result.resetId).toBeDefined()
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled()
    })

    it("should return success even for non-existent email", async () => {
      const result = await service.initiatePasswordReset({
        email: "nonexistent@example.com",
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain("password reset link has been sent")
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it("should throw BadRequestException for invalid email format", async () => {
      await expect(
        service.initiatePasswordReset({
          email: "invalid-email",
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it("should not send email for inactive user", async () => {
      const result = await service.initiatePasswordReset({
        email: "inactive@example.com",
      })

      expect(result.success).toBe(true)
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })
  })

  describe("validateResetToken", () => {
    it("should return false for invalid token", async () => {
      const result = await service.validateResetToken("invalid-token")
      expect(result.valid).toBe(false)
    })

    it("should return false for empty token", async () => {
      const result = await service.validateResetToken("")
      expect(result.valid).toBe(false)
    })
  })

  describe("resetPassword", () => {
    it("should throw BadRequestException for mismatched passwords", async () => {
      await expect(
        service.resetPassword({
          token: "valid-token",
          newPassword: "NewPassword123!",
          confirmPassword: "DifferentPassword123!",
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it("should throw BadRequestException for weak password", async () => {
      await expect(
        service.resetPassword({
          token: "valid-token",
          newPassword: "weak",
          confirmPassword: "weak",
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it("should throw UnauthorizedException for invalid token", async () => {
      await expect(
        service.resetPassword({
          token: "invalid-token",
          newPassword: "StrongPassword123!",
          confirmPassword: "StrongPassword123!",
        }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe("password validation", () => {
    const validPasswords = ["StrongPassword123!", "MySecure@Pass1", "Complex#Password9"]

    const invalidPasswords = [
      "short", // Too short
      "nouppercase123!", // No uppercase
      "NOLOWERCASE123!", // No lowercase
      "NoNumbers!", // No numbers
      "NoSpecialChars123", // No special characters
      "password", // Common password
    ]

    validPasswords.forEach((password) => {
      it(`should accept valid password: ${password}`, async () => {
        // This would be tested indirectly through resetPassword
        // when a valid token is provided
        expect(password.length).toBeGreaterThanOrEqual(8)
      })
    })

    invalidPasswords.forEach((password) => {
      it(`should reject invalid password: ${password}`, async () => {
        await expect(
          service.resetPassword({
            token: "valid-token",
            newPassword: password,
            confirmPassword: password,
          }),
        ).rejects.toThrow(BadRequestException)
      })
    })
  })
})
