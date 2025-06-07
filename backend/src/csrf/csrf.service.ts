import { Injectable, Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import * as crypto from "crypto"

interface CsrfTokenData {
  timestamp: number
  randomValue: string
  signature: string
}

interface CsrfStats {
  totalTokensGenerated: number
  totalValidations: number
  validationFailures: number
  recentFailures: CsrfFailure[]
}

interface CsrfFailure {
  timestamp: Date
  ip: string
  userAgent: string
  url: string
  method: string
  reason: string
}

@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name)
  private stats: CsrfStats = {
    totalTokensGenerated: 0,
    totalValidations: 0,
    validationFailures: 0,
    recentFailures: [],
  }

  // Token configuration
  private readonly TOKEN_EXPIRY_HOURS = 24
  private readonly SECRET_LENGTH = 32
  private readonly RANDOM_VALUE_LENGTH = 16

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate a cryptographically secure CSRF secret
   */
  generateSecret(): string {
    const secret = crypto.randomBytes(this.SECRET_LENGTH).toString("hex")
    this.logger.debug("CSRF secret generated")
    return secret
  }

  /**
   * Generate a CSRF token using the secret
   */
  generateToken(secret: string): string {
    try {
      const timestamp = Date.now()
      const randomValue = crypto.randomBytes(this.RANDOM_VALUE_LENGTH).toString("hex")

      // Create token data
      const tokenData: CsrfTokenData = {
        timestamp,
        randomValue,
        signature: this.createSignature(secret, timestamp, randomValue),
      }

      // Encode token data
      const token = this.encodeTokenData(tokenData)

      this.stats.totalTokensGenerated++
      this.logger.debug("CSRF token generated", { timestamp, randomValue: randomValue.substring(0, 8) + "..." })

      return token
    } catch (error) {
      this.logger.error(`Failed to generate CSRF token: ${error.message}`)
      throw new Error("Failed to generate CSRF token")
    }
  }

  /**
   * Validate a CSRF token
   */
  validateToken(token: string, secret: string): boolean {
    try {
      this.stats.totalValidations++

      // Decode token data
      const tokenData = this.decodeTokenData(token)

      if (!tokenData) {
        this.recordValidationFailure("Invalid token format")
        return false
      }

      // Check token expiry
      const now = Date.now()
      const tokenAge = now - tokenData.timestamp
      const maxAge = this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000

      if (tokenAge > maxAge) {
        this.recordValidationFailure("Token expired")
        return false
      }

      // Verify signature
      const expectedSignature = this.createSignature(secret, tokenData.timestamp, tokenData.randomValue)

      if (!this.constantTimeCompare(tokenData.signature, expectedSignature)) {
        this.recordValidationFailure("Invalid signature")
        return false
      }

      this.logger.debug("CSRF token validated successfully")
      return true
    } catch (error) {
      this.logger.error(`CSRF token validation error: ${error.message}`)
      this.recordValidationFailure(`Validation error: ${error.message}`)
      return false
    }
  }

  /**
   * Get CSRF protection statistics
   */
  getStats(): CsrfStats {
    return {
      ...this.stats,
      recentFailures: this.stats.recentFailures.slice(-50), // Last 50 failures
    }
  }

  /**
   * Clear CSRF statistics
   */
  clearStats(): void {
    this.stats = {
      totalTokensGenerated: 0,
      totalValidations: 0,
      validationFailures: 0,
      recentFailures: [],
    }
    this.logger.log("CSRF statistics cleared")
  }

  /**
   * Create HMAC signature for token
   */
  private createSignature(secret: string, timestamp: number, randomValue: string): string {
    const data = `${timestamp}:${randomValue}`
    return crypto.createHmac("sha256", secret).update(data).digest("hex")
  }

  /**
   * Encode token data to base64
   */
  private encodeTokenData(tokenData: CsrfTokenData): string {
    const jsonData = JSON.stringify(tokenData)
    return Buffer.from(jsonData).toString("base64url")
  }

  /**
   * Decode token data from base64
   */
  private decodeTokenData(token: string): CsrfTokenData | null {
    try {
      const jsonData = Buffer.from(token, "base64url").toString("utf8")
      const tokenData = JSON.parse(jsonData) as CsrfTokenData

      // Validate token data structure
      if (
        typeof tokenData.timestamp !== "number" ||
        typeof tokenData.randomValue !== "string" ||
        typeof tokenData.signature !== "string"
      ) {
        return null
      }

      return tokenData
    } catch (error) {
      return null
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }

    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return result === 0
  }

  /**
   * Record validation failure for monitoring
   */
  private recordValidationFailure(reason: string, req?: any): void {
    this.stats.validationFailures++

    const failure: CsrfFailure = {
      timestamp: new Date(),
      ip: req?.ip || "unknown",
      userAgent: req?.get?.("User-Agent") || "unknown",
      url: req?.url || "unknown",
      method: req?.method || "unknown",
      reason,
    }

    this.stats.recentFailures.push(failure)

    // Keep only recent failures to prevent memory issues
    if (this.stats.recentFailures.length > 100) {
      this.stats.recentFailures = this.stats.recentFailures.slice(-100)
    }

    this.logger.warn("CSRF validation failure", failure)
  }
}
