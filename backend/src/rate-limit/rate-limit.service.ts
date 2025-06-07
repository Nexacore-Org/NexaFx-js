import { Injectable } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { RateLimitStorage } from "./storage/rate-limit.storage"
import type { RateLimitOptions } from "./decorators/rate-limit.decorator"

export interface RateLimitResult {
  allowed: boolean
  limit: number
  current: number
  remaining: number
  resetTime: number
  retryAfter?: number
  message?: string
}

export interface BruteForceAttempt {
  ip: string
  endpoint: string
  timestamp: number
  success: boolean
  userAgent?: string
  userId?: string
}

export interface BruteForceStatus {
  isBlocked: boolean
  attempts: number
  blockUntil?: number
  message?: string
}

@Injectable()
export class RateLimitService {
  private readonly defaultOptions = {
    limit: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  }

  private readonly bruteForceOptions = {
    maxAttempts: 5,
    blockDuration: 15 * 60 * 1000, // 15 minutes
    windowMs: 15 * 60 * 1000, // 15 minutes
  }

  constructor(
    private readonly storage: RateLimitStorage,
    private readonly configService: ConfigService,
  ) {}

  async checkRateLimit(clientId: string, endpoint: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const config = { ...this.defaultOptions, ...options }
    const key = `rate_limit:${clientId}:${endpoint}`
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Get current count for this window
    const current = await this.storage.getCount(key, windowStart)
    const resetTime = now + config.windowMs

    const result: RateLimitResult = {
      allowed: current < config.limit,
      limit: config.limit,
      current: current + 1, // Include current request
      remaining: Math.max(0, config.limit - current - 1),
      resetTime,
    }

    if (!result.allowed) {
      result.retryAfter = config.windowMs
      result.message = `Rate limit exceeded. Try again in ${Math.ceil(config.windowMs / 1000)} seconds.`
    } else {
      // Increment counter for this request
      await this.storage.increment(key, now, config.windowMs)
    }

    return result
  }

  async recordLoginAttempt(attempt: BruteForceAttempt): Promise<void> {
    const key = `brute_force:${attempt.ip}:${attempt.endpoint}`
    await this.storage.recordAttempt(key, attempt)
  }

  async checkBruteForce(ip: string, endpoint: string): Promise<BruteForceStatus> {
    const key = `brute_force:${ip}:${endpoint}`
    const blockKey = `brute_force_block:${ip}:${endpoint}`
    const now = Date.now()

    // Check if IP is currently blocked
    const blockUntil = await this.storage.getBlockTime(blockKey)
    if (blockUntil && blockUntil > now) {
      return {
        isBlocked: true,
        attempts: 0,
        blockUntil,
        message: `IP blocked until ${new Date(blockUntil).toISOString()}`,
      }
    }

    // Get failed attempts in the current window
    const windowStart = now - this.bruteForceOptions.windowMs
    const attempts = await this.storage.getFailedAttempts(key, windowStart)

    const isBlocked = attempts.length >= this.bruteForceOptions.maxAttempts

    if (isBlocked) {
      const newBlockUntil = now + this.bruteForceOptions.blockDuration
      await this.storage.setBlock(blockKey, newBlockUntil)

      return {
        isBlocked: true,
        attempts: attempts.length,
        blockUntil: newBlockUntil,
        message: `Too many failed attempts. IP blocked for ${this.bruteForceOptions.blockDuration / 1000} seconds.`,
      }
    }

    return {
      isBlocked: false,
      attempts: attempts.length,
    }
  }

  async clearBruteForceAttempts(ip: string, endpoint: string): Promise<void> {
    const key = `brute_force:${ip}:${endpoint}`
    const blockKey = `brute_force_block:${ip}:${endpoint}`

    await this.storage.clearAttempts(key)
    await this.storage.clearBlock(blockKey)
  }

  async getStatistics(timeRange: number = 24 * 60 * 60 * 1000): Promise<{
    totalRequests: number
    blockedRequests: number
    topIPs: Array<{ ip: string; requests: number }>
    topEndpoints: Array<{ endpoint: string; requests: number }>
  }> {
    const now = Date.now()
    const since = now - timeRange

    return await this.storage.getStatistics(since, now)
  }

  async whitelist(ip: string, duration?: number): Promise<void> {
    const key = `whitelist:${ip}`
    const expiry = duration ? Date.now() + duration : undefined
    await this.storage.setWhitelist(key, expiry)
  }

  async blacklist(ip: string, duration?: number): Promise<void> {
    const key = `blacklist:${ip}`
    const expiry = duration ? Date.now() + duration : undefined
    await this.storage.setBlacklist(key, expiry)
  }

  async isWhitelisted(ip: string): Promise<boolean> {
    const key = `whitelist:${ip}`
    return await this.storage.isWhitelisted(key)
  }

  async isBlacklisted(ip: string): Promise<boolean> {
    const key = `blacklist:${ip}`
    return await this.storage.isBlacklisted(key)
  }
}
