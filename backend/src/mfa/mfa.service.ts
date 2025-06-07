import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import * as speakeasy from "speakeasy"
import * as QRCode from "qrcode"
import * as crypto from "crypto"

interface User {
  id: string
  email: string
  mfaEnabled: boolean
  mfaSecret?: string
  backupCodes?: string[]
  mfaVerified?: boolean
}

interface MfaSetupResponse {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
  manualEntryKey: string
}

interface MfaVerificationResult {
  success: boolean
  backupCodeUsed?: boolean
}

// Mock user repository - replace with your actual user repository
class UserRepository {
  private users: User[] = [
    {
      id: "user-123",
      email: "test@example.com",
      mfaEnabled: false,
    },
  ]

  async findById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id)
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const userIndex = this.users.findIndex((user) => user.id === id)
    if (userIndex === -1) {
      throw new Error("User not found")
    }

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...userData,
    }

    return this.users[userIndex]
  }
}

@Injectable()
export class MfaService {
  private userRepository = new UserRepository()

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate MFA setup data including secret, QR code, and backup codes
   */
  async generateMfaSetup(userId: string): Promise<MfaSetupResponse> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    // Generate a secret for the user
    const secret = speakeasy.generateSecret({
      name: `${this.configService.get("APP_NAME", "MyApp")} (${user.email})`,
      issuer: this.configService.get("APP_NAME", "MyApp"),
      length: 32,
    })

    // Generate QR code URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!)

    // Generate backup codes
    const backupCodes = this.generateBackupCodes()

    // Store the secret temporarily (not enabled yet)
    await this.userRepository.update(userId, {
      mfaSecret: secret.base32,
      backupCodes: backupCodes.map((code) => this.hashBackupCode(code)),
      mfaVerified: false,
    })

    return {
      secret: secret.base32!,
      qrCodeUrl,
      backupCodes,
      manualEntryKey: secret.base32!,
    }
  }

  /**
   * Verify TOTP code and enable MFA for the user
   */
  async enableMfa(userId: string, totpCode: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    if (!user.mfaSecret) {
      throw new BadRequestException("MFA setup not initiated. Please generate setup first.")
    }

    if (user.mfaEnabled) {
      throw new BadRequestException("MFA is already enabled for this user")
    }

    // Verify the TOTP code
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: "base32",
      token: totpCode,
      window: 2, // Allow 2 time steps before and after current time
    })

    if (!verified) {
      throw new UnauthorizedException("Invalid TOTP code")
    }

    // Enable MFA for the user
    await this.userRepository.update(userId, {
      mfaEnabled: true,
      mfaVerified: true,
    })

    return {
      success: true,
      message: "MFA has been successfully enabled",
    }
  }

  /**
   * Disable MFA for the user
   */
  async disableMfa(userId: string, totpCode: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException("MFA is not enabled for this user")
    }

    // Verify the TOTP code before disabling
    const verified = await this.verifyTotp(userId, totpCode)
    if (!verified.success) {
      throw new UnauthorizedException("Invalid TOTP code")
    }

    // Disable MFA and clear secrets
    await this.userRepository.update(userId, {
      mfaEnabled: false,
      mfaSecret: undefined,
      backupCodes: undefined,
      mfaVerified: false,
    })

    return {
      success: true,
      message: "MFA has been successfully disabled",
    }
  }

  /**
   * Verify TOTP code during login
   */
  async verifyTotp(userId: string, totpCode: string): Promise<MfaVerificationResult> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException("MFA is not enabled for this user")
    }

    // First, try to verify as a TOTP code
    const totpVerified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: "base32",
      token: totpCode,
      window: 2,
    })

    if (totpVerified) {
      return { success: true }
    }

    // If TOTP fails, check if it's a backup code
    if (user.backupCodes && user.backupCodes.length > 0) {
      const hashedCode = this.hashBackupCode(totpCode)
      const backupCodeIndex = user.backupCodes.findIndex((code) => code === hashedCode)

      if (backupCodeIndex !== -1) {
        // Remove the used backup code
        const updatedBackupCodes = [...user.backupCodes]
        updatedBackupCodes.splice(backupCodeIndex, 1)

        await this.userRepository.update(userId, {
          backupCodes: updatedBackupCodes,
        })

        return { success: true, backupCodeUsed: true }
      }
    }

    return { success: false }
  }

  /**
   * Get MFA status for a user
   */
  async getMfaStatus(userId: string): Promise<{
    enabled: boolean
    verified: boolean
    backupCodesCount: number
  }> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    return {
      enabled: user.mfaEnabled || false,
      verified: user.mfaVerified || false,
      backupCodesCount: user.backupCodes?.length || 0,
    }
  }

  /**
   * Generate new backup codes
   */
  async generateNewBackupCodes(userId: string, totpCode: string): Promise<string[]> {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException("User not found")
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException("MFA is not enabled for this user")
    }

    // Verify TOTP code before generating new backup codes
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret!,
      encoding: "base32",
      token: totpCode,
      window: 2,
    })

    if (!verified) {
      throw new UnauthorizedException("Invalid TOTP code")
    }

    // Generate new backup codes
    const backupCodes = this.generateBackupCodes()

    // Update user with new backup codes
    await this.userRepository.update(userId, {
      backupCodes: backupCodes.map((code) => this.hashBackupCode(code)),
    })

    return backupCodes
  }

  /**
   * Check if user requires MFA verification
   */
  async requiresMfa(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId)
    return user?.mfaEnabled || false
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count = 10): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString("hex").toUpperCase()
      codes.push(code)
    }
    return codes
  }

  /**
   * Hash backup codes for secure storage
   */
  private hashBackupCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex")
  }
}
