import { Injectable, BadRequestException, UnauthorizedException, NotFoundException, Logger } from "@nestjs/common"
import type { JwtService } from "@nestjs/jwt"
import type { ConfigService } from "@nestjs/config"
import type { EmailService } from "./email.service"
import * as bcrypt from "bcrypt"
import * as crypto from "crypto"

interface User {
  id: string
  email: string
  password: string
  firstName?: string
  lastName?: string
  isActive: boolean
  passwordResetToken?: string
  passwordResetExpires?: Date
  passwordResetAttempts?: number
  lastPasswordReset?: Date
}

interface PasswordResetToken {
  userId: string
  email: string
  tokenHash: string
  expiresAt: Date
  attempts: number
}

interface ResetPasswordRequest {
  email: string
}

interface ConfirmResetRequest {
  token: string
  newPassword: string
  confirmPassword: string
}

interface PasswordResetResult {
  success: boolean
  message: string
  resetId?: string
}

// Mock user repository - replace with your actual user repository
class UserRepository {
  private users: User[] = [
    {
      id: "user-123",
      email: "test@example.com",
      password: "$2b$10$hashedpassword", // bcrypt hashed password
      firstName: "Test",
      lastName: "User",
      isActive: true,
    },
    {
      id: "user-456",
      email: "inactive@example.com",
      password: "$2b$10$hashedpassword",
      firstName: "Inactive",
      lastName: "User",
      isActive: false,
    },
  ]

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase())
  }

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

// Mock token storage - replace with Redis or database
class TokenRepository {
  private tokens: Map<string, PasswordResetToken> = new Map()

  async store(tokenHash: string, tokenData: PasswordResetToken): Promise<void> {
    this.tokens.set(tokenHash, tokenData)
  }

  async find(tokenHash: string): Promise<PasswordResetToken | undefined> {
    return this.tokens.get(tokenHash)
  }

  async delete(tokenHash: string): Promise<void> {
    this.tokens.delete(tokenHash)
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const [hash, token] of this.tokens.entries()) {
      if (token.userId === userId) {
        this.tokens.delete(hash)
      }
    }
  }

  async cleanup(): Promise<void> {
    const now = new Date()
    for (const [hash, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.tokens.delete(hash)
      }
    }
  }
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name)
  private userRepository = new UserRepository()
  private tokenRepository = new TokenRepository()

  // Rate limiting: max attempts per email per time window
  private readonly MAX_RESET_ATTEMPTS = 5
  private readonly RESET_WINDOW_MINUTES = 60
  private readonly TOKEN_EXPIRY_MINUTES = 60
  private readonly MIN_PASSWORD_LENGTH = 8

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    // Cleanup expired tokens every hour
    setInterval(
      () => {
        this.tokenRepository.cleanup()
      },
      60 * 60 * 1000,
    )
  }

  /**
   * Initiate password reset process
   */
  async initiatePasswordReset(request: ResetPasswordRequest): Promise<PasswordResetResult> {
    try {
      const { email } = request

      // Validate email format
      if (!this.isValidEmail(email)) {
        throw new BadRequestException("Invalid email format")
      }

      // Find user by email
      const user = await this.userRepository.findByEmail(email)

      // Always return success to prevent email enumeration attacks
      // But only send email if user exists and is active
      if (user && user.isActive) {
        // Check rate limiting
        await this.checkRateLimiting(user.id)

        // Generate secure reset token
        const resetToken = await this.generateResetToken(user)

        // Send reset email
        await this.emailService.sendPasswordResetEmail(user, resetToken)

        // Log the reset attempt
        this.logger.log(`Password reset initiated for user ${user.id}`, {
          userId: user.id,
          email: user.email,
          timestamp: new Date().toISOString(),
        })

        return {
          success: true,
          message: "If an account with that email exists, a password reset link has been sent.",
          resetId: this.generateResetId(),
        }
      }

      // Return same message even if user doesn't exist (security best practice)
      return {
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      }
    } catch (error) {
      this.logger.error(`Password reset initiation failed: ${error.message}`, {
        email: request.email,
        error: error.message,
      })

      if (error instanceof BadRequestException) {
        throw error
      }

      throw new BadRequestException("Failed to process password reset request")
    }
  }

  /**
   * Validate reset token
   */
  async validateResetToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
    try {
      if (!token) {
        return { valid: false }
      }

      // Hash the token to look it up
      const tokenHash = this.hashToken(token)

      // Find token in storage
      const storedToken = await this.tokenRepository.find(tokenHash)

      if (!storedToken) {
        return { valid: false }
      }

      // Check if token has expired
      if (storedToken.expiresAt < new Date()) {
        await this.tokenRepository.delete(tokenHash)
        return { valid: false }
      }

      // Verify user still exists and is active
      const user = await this.userRepository.findById(storedToken.userId)
      if (!user || !user.isActive) {
        await this.tokenRepository.delete(tokenHash)
        return { valid: false }
      }

      return {
        valid: true,
        userId: storedToken.userId,
        email: storedToken.email,
      }
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`, { token: token.substring(0, 10) + "..." })
      return { valid: false }
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(request: ConfirmResetRequest): Promise<PasswordResetResult> {
    try {
      const { token, newPassword, confirmPassword } = request

      // Validate input
      if (!token || !newPassword || !confirmPassword) {
        throw new BadRequestException("Token, new password, and confirmation are required")
      }

      if (newPassword !== confirmPassword) {
        throw new BadRequestException("Passwords do not match")
      }

      // Validate password strength
      this.validatePasswordStrength(newPassword)

      // Validate token
      const tokenValidation = await this.validateResetToken(token)
      if (!tokenValidation.valid || !tokenValidation.userId) {
        throw new UnauthorizedException("Invalid or expired reset token")
      }

      // Get user
      const user = await this.userRepository.findById(tokenValidation.userId)
      if (!user) {
        throw new NotFoundException("User not found")
      }

      // Check if new password is different from current password
      const isSamePassword = await bcrypt.compare(newPassword, user.password)
      if (isSamePassword) {
        throw new BadRequestException("New password must be different from current password")
      }

      // Hash new password
      const saltRounds = this.configService.get<number>("BCRYPT_SALT_ROUNDS", 12)
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds)

      // Update user password
      await this.userRepository.update(user.id, {
        password: hashedPassword,
        lastPasswordReset: new Date(),
        passwordResetToken: undefined,
        passwordResetExpires: undefined,
        passwordResetAttempts: 0,
      })

      // Delete all reset tokens for this user
      await this.tokenRepository.deleteByUserId(user.id)

      // Send confirmation email
      await this.emailService.sendPasswordResetConfirmationEmail(user)

      // Log successful password reset
      this.logger.log(`Password reset completed for user ${user.id}`, {
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      })

      return {
        success: true,
        message: "Password has been reset successfully",
      }
    } catch (error) {
      this.logger.error(`Password reset failed: ${error.message}`, {
        token: request.token?.substring(0, 10) + "...",
        error: error.message,
      })

      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      ) {
        throw error
      }

      throw new BadRequestException("Failed to reset password")
    }
  }

  /**
   * Get password reset status
   */
  async getResetStatus(token: string): Promise<{
    valid: boolean
    expiresAt?: Date
    email?: string
    attemptsRemaining?: number
  }> {
    const tokenHash = this.hashToken(token)
    const storedToken = await this.tokenRepository.find(tokenHash)

    if (!storedToken) {
      return { valid: false }
    }

    if (storedToken.expiresAt < new Date()) {
      await this.tokenRepository.delete(tokenHash)
      return { valid: false }
    }

    return {
      valid: true,
      expiresAt: storedToken.expiresAt,
      email: this.maskEmail(storedToken.email),
      attemptsRemaining: Math.max(0, this.MAX_RESET_ATTEMPTS - storedToken.attempts),
    }
  }

  /**
   * Cancel password reset
   */
  async cancelPasswordReset(userId: string): Promise<void> {
    await this.tokenRepository.deleteByUserId(userId)
    this.logger.log(`Password reset cancelled for user ${userId}`)
  }

  /**
   * Generate secure reset token
   */
  private async generateResetToken(user: User): Promise<string> {
    // Generate cryptographically secure random token
    const tokenBytes = crypto.randomBytes(32)
    const token = tokenBytes.toString("hex")

    // Hash token for storage
    const tokenHash = this.hashToken(token)

    // Calculate expiry time
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + this.TOKEN_EXPIRY_MINUTES)

    // Store token data
    const tokenData: PasswordResetToken = {
      userId: user.id,
      email: user.email,
      tokenHash,
      expiresAt,
      attempts: 0,
    }

    await this.tokenRepository.store(tokenHash, tokenData)

    // Update user record
    await this.userRepository.update(user.id, {
      passwordResetToken: tokenHash,
      passwordResetExpires: expiresAt,
      passwordResetAttempts: (user.passwordResetAttempts || 0) + 1,
    })

    return token
  }

  /**
   * Hash token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
  }

  /**
   * Check rate limiting for password reset attempts
   */
  private async checkRateLimiting(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (!user) return

    const now = new Date()
    const windowStart = new Date(now.getTime() - this.RESET_WINDOW_MINUTES * 60 * 1000)

    // Check if user has exceeded reset attempts in the time window
    if (user.passwordResetAttempts && user.passwordResetAttempts >= this.MAX_RESET_ATTEMPTS) {
      if (user.lastPasswordReset && user.lastPasswordReset > windowStart) {
        throw new BadRequestException(
          `Too many password reset attempts. Please try again in ${this.RESET_WINDOW_MINUTES} minutes.`,
        )
      } else {
        // Reset attempts counter if window has passed
        await this.userRepository.update(userId, {
          passwordResetAttempts: 0,
        })
      }
    }
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): void {
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${this.MIN_PASSWORD_LENGTH} characters long`)
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException("Password must contain at least one uppercase letter")
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      throw new BadRequestException("Password must contain at least one lowercase letter")
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      throw new BadRequestException("Password must contain at least one number")
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      throw new BadRequestException("Password must contain at least one special character")
    }

    // Check for common weak passwords
    const commonPasswords = ["password", "123456", "qwerty", "admin", "letmein"]
    if (commonPasswords.includes(password.toLowerCase())) {
      throw new BadRequestException("Password is too common. Please choose a stronger password")
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Mask email for privacy
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split("@")
    const maskedLocal =
      localPart.length > 2 ? localPart[0] + "*".repeat(localPart.length - 2) + localPart.slice(-1) : localPart
    return `${maskedLocal}@${domain}`
  }

  /**
   * Generate reset ID for tracking
   */
  private generateResetId(): string {
    return crypto.randomBytes(8).toString("hex")
  }
}
