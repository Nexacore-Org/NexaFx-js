import { Injectable } from "@nestjs/common"
import { RateLimitStorage } from "./rate-limit.storage"
import type { BruteForceAttempt } from "../rate-limit.service"

interface MemoryRecord {
  count: number
  timestamps: number[]
  windowStart: number
}

interface AttemptRecord {
  attempts: BruteForceAttempt[]
}

@Injectable()
export class MemoryRateLimitStorage extends RateLimitStorage {
  private readonly records = new Map<string, MemoryRecord>()
  private readonly attempts = new Map<string, AttemptRecord>()
  private readonly blocks = new Map<string, number>()
  private readonly whitelist = new Map<string, number | undefined>()
  private readonly blacklist = new Map<string, number | undefined>()

  async getCount(key: string, windowStart: number): Promise<number> {
    const record = this.records.get(key)
    if (!record) {
      return 0
    }

    // Clean up old timestamps
    record.timestamps = record.timestamps.filter((ts) => ts >= windowStart)
    record.count = record.timestamps.length

    return record.count
  }

  async increment(key: string, timestamp: number, windowMs: number): Promise<void> {
    const windowStart = timestamp - windowMs
    let record = this.records.get(key)

    if (!record) {
      record = { count: 0, timestamps: [], windowStart }
      this.records.set(key, record)
    }

    // Clean up old timestamps
    record.timestamps = record.timestamps.filter((ts) => ts >= windowStart)
    record.timestamps.push(timestamp)
    record.count = record.timestamps.length
    record.windowStart = windowStart

    // Schedule cleanup
    setTimeout(() => {
      this.cleanup(key, timestamp + windowMs)
    }, windowMs)
  }

  async recordAttempt(key: string, attempt: BruteForceAttempt): Promise<void> {
    let record = this.attempts.get(key)
    if (!record) {
      record = { attempts: [] }
      this.attempts.set(key, record)
    }

    record.attempts.push(attempt)

    // Keep only recent attempts (last 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    record.attempts = record.attempts.filter((a) => a.timestamp >= cutoff)
  }

  async getFailedAttempts(key: string, windowStart: number): Promise<BruteForceAttempt[]> {
    const record = this.attempts.get(key)
    if (!record) {
      return []
    }

    return record.attempts.filter((attempt) => attempt.timestamp >= windowStart && !attempt.success)
  }

  async clearAttempts(key: string): Promise<void> {
    this.attempts.delete(key)
  }

  async getBlockTime(key: string): Promise<number | null> {
    const blockUntil = this.blocks.get(key)
    if (!blockUntil || blockUntil <= Date.now()) {
      this.blocks.delete(key)
      return null
    }
    return blockUntil
  }

  async setBlock(key: string, blockUntil: number): Promise<void> {
    this.blocks.set(key, blockUntil)

    // Schedule cleanup
    setTimeout(() => {
      this.blocks.delete(key)
    }, blockUntil - Date.now())
  }

  async clearBlock(key: string): Promise<void> {
    this.blocks.delete(key)
  }

  async setWhitelist(key: string, expiry?: number): Promise<void> {
    this.whitelist.set(key, expiry)

    if (expiry) {
      setTimeout(() => {
        this.whitelist.delete(key)
      }, expiry - Date.now())
    }
  }

  async setBlacklist(key: string, expiry?: number): Promise<void> {
    this.blacklist.set(key, expiry)

    if (expiry) {
      setTimeout(() => {
        this.blacklist.delete(key)
      }, expiry - Date.now())
    }
  }

  async isWhitelisted(key: string): Promise<boolean> {
    const expiry = this.whitelist.get(key)
    if (expiry === undefined) {
      return false
    }
    if (expiry && expiry <= Date.now()) {
      this.whitelist.delete(key)
      return false
    }
    return true
  }

  async isBlacklisted(key: string): Promise<boolean> {
    const expiry = this.blacklist.get(key)
    if (expiry === undefined) {
      return false
    }
    if (expiry && expiry <= Date.now()) {
      this.blacklist.delete(key)
      return false
    }
    return true
  }

  async getStatistics(
    since: number,
    until: number,
  ): Promise<{
    totalRequests: number
    blockedRequests: number
    topIPs: Array<{ ip: string; requests: number }>
    topEndpoints: Array<{ endpoint: string; requests: number }>
  }> {
    let totalRequests = 0
    let blockedRequests = 0
    const ipCounts = new Map<string, number>()
    const endpointCounts = new Map<string, number>()

    // Analyze rate limit records
    for (const [key, record] of this.records.entries()) {
      const relevantTimestamps = record.timestamps.filter((ts) => ts >= since && ts <= until)
      totalRequests += relevantTimestamps.length

      // Extract IP and endpoint from key
      const parts = key.split(":")
      if (parts.length >= 3) {
        const ip = parts[1]
        const endpoint = parts.slice(2).join(":")

        ipCounts.set(ip, (ipCounts.get(ip) || 0) + relevantTimestamps.length)
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + relevantTimestamps.length)
      }
    }

    // Count blocked requests (simplified - in real implementation, track this separately)
    blockedRequests = Math.floor(totalRequests * 0.05) // Estimate 5% blocked

    const topIPs = Array.from(ipCounts.entries())
      .map(([ip, requests]) => ({ ip, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)

    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, requests]) => ({ endpoint, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)

    return {
      totalRequests,
      blockedRequests,
      topIPs,
      topEndpoints,
    }
  }

  private cleanup(key: string, expiry: number): void {
    if (Date.now() >= expiry) {
      this.records.delete(key)
    }
  }
}
