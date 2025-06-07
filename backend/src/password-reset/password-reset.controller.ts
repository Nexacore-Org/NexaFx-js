import { Controller, Post, Get, BadRequestException, HttpCode, HttpStatus } from "@nestjs/common"
import type { PasswordResetService } from "./password-reset.service"

interface InitiateResetDto {
  email: string
}

interface ConfirmResetDto {
  token: string
  newPassword: string
  confirmPassword: string
}

interface ValidateTokenDto {
  token: string
}

@Controller("auth/password-reset")
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /**
   * Initiate password reset process
   */
  @Post("initiate")
  @HttpCode(HttpStatus.OK)
  async initiateReset(body: InitiateResetDto) {
    try {
      if (!body.email) {
        throw new BadRequestException("Email is required")
      }

      const result = await this.passwordResetService.initiatePasswordReset({
        email: body.email.trim().toLowerCase(),
      })

      return {
        success: true,
        message: result.message,
        resetId: result.resetId,
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new BadRequestException("Failed to initiate password reset")
    }
  }

  /**
   * Validate reset token
   */
  @Get("validate")
  async validateToken(query: ValidateTokenDto) {
    try {
      if (!query.token) {
        throw new BadRequestException("Token is required")
      }

      const validation = await this.passwordResetService.validateResetToken(query.token)

      if (!validation.valid) {
        return {
          success: false,
          message: "Invalid or expired reset token",
          valid: false,
        }
      }

      const status = await this.passwordResetService.getResetStatus(query.token)

      return {
        success: true,
        message: "Token is valid",
        valid: true,
        data: {
          email: status.email,
          expiresAt: status.expiresAt,
          attemptsRemaining: status.attemptsRemaining,
        },
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new BadRequestException("Failed to validate token")
    }
  }

  /**
   * Confirm password reset
   */
  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  async confirmReset(body: ConfirmResetDto) {
    try {
      if (!body.token || !body.newPassword || !body.confirmPassword) {
        throw new BadRequestException("Token, new password, and confirmation are required")
      }

      const result = await this.passwordResetService.resetPassword({
        token: body.token,
        newPassword: body.newPassword,
        confirmPassword: body.confirmPassword,
      })

      return {
        success: true,
        message: result.message,
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new BadRequestException("Failed to reset password")
    }
  }

  /**
   * Get password reset status
   */
  @Get("status")
  async getResetStatus(token: string) {
    try {
      if (!token) {
        throw new BadRequestException("Token is required")
      }

      const status = await this.passwordResetService.getResetStatus(token)

      return {
        success: true,
        data: status,
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new BadRequestException("Failed to get reset status")
    }
  }

  /**
   * Get password requirements
   */
  @Get("requirements")
  getPasswordRequirements() {
    return {
      success: true,
      data: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        forbiddenPasswords: ["password", "123456", "qwerty", "admin", "letmein"],
      },
    }
  }
}
