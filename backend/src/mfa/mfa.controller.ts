import { Controller, Post, Get, Body, UseGuards, BadRequestException, UnauthorizedException } from "@nestjs/common"
import type { MfaService } from "./mfa.service"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"

interface AuthenticatedRequest {
  user: {
    id: string
    email: string
  }
}

@Controller("mfa")
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * Get MFA status for the current user
   */
  @Get("status")
  async getMfaStatus(req: AuthenticatedRequest) {
    try {
      const status = await this.mfaService.getMfaStatus(req.user.id)
      return {
        success: true,
        data: status,
      }
    } catch (error) {
      throw new BadRequestException(error.message)
    }
  }

  /**
   * Generate MFA setup (QR code, secret, backup codes)
   */
  @Post("setup")
  async setupMfa(req: AuthenticatedRequest) {
    try {
      const setupData = await this.mfaService.generateMfaSetup(req.user.id)
      return {
        success: true,
        data: setupData,
        message:
          "MFA setup generated. Please scan the QR code with your authenticator app and verify with a TOTP code.",
      }
    } catch (error) {
      throw new BadRequestException(error.message)
    }
  }

  /**
   * Enable MFA by verifying TOTP code
   */
  @Post("enable")
  async enableMfa(req: AuthenticatedRequest, @Body() body: { totpCode: string }) {
    try {
      if (!body.totpCode) {
        throw new BadRequestException("TOTP code is required")
      }

      const result = await this.mfaService.enableMfa(req.user.id, body.totpCode)
      return {
        success: true,
        message: result.message,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message)
      }
      throw new BadRequestException(error.message)
    }
  }

  /**
   * Disable MFA by verifying TOTP code
   */
  @Post("disable")
  async disableMfa(req: AuthenticatedRequest, @Body() body: { totpCode: string }) {
    try {
      if (!body.totpCode) {
        throw new BadRequestException("TOTP code is required")
      }

      const result = await this.mfaService.disableMfa(req.user.id, body.totpCode)
      return {
        success: true,
        message: result.message,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message)
      }
      throw new BadRequestException(error.message)
    }
  }

  /**
   * Verify TOTP code (for login or other verification purposes)
   */
  @Post("verify")
  async verifyTotp(req: AuthenticatedRequest, @Body() body: { totpCode: string }) {
    try {
      if (!body.totpCode) {
        throw new BadRequestException("TOTP code is required")
      }

      const result = await this.mfaService.verifyTotp(req.user.id, body.totpCode)

      if (!result.success) {
        throw new UnauthorizedException("Invalid TOTP code")
      }

      return {
        success: true,
        message: result.backupCodeUsed ? "Verification successful using backup code" : "TOTP verification successful",
        backupCodeUsed: result.backupCodeUsed || false,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message)
      }
      throw new BadRequestException(error.message)
    }
  }

  /**
   * Generate new backup codes
   */
  @Post("backup-codes/regenerate")
  async regenerateBackupCodes(req: AuthenticatedRequest, @Body() body: { totpCode: string }) {
    try {
      if (!body.totpCode) {
        throw new BadRequestException("TOTP code is required")
      }

      const backupCodes = await this.mfaService.generateNewBackupCodes(req.user.id, body.totpCode)
      return {
        success: true,
        data: {
          backupCodes,
        },
        message: "New backup codes generated successfully. Please store them securely.",
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(error.message)
      }
      throw new BadRequestException(error.message)
    }
  }
}
