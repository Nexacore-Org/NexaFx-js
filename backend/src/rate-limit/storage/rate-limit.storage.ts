import type { BruteForceAttempt } from "../rate-limit.service"

export abstract class RateLimitStorage {
  abstract getCount(key: string, windowStart: number): Promise<number>
  abstract increment(key: string, timestamp: number, windowMs: number): Promise<void>
  abstract recordAttempt(key: string, attempt: BruteForceAttempt): Promise<void>
  abstract getFailedAttempts(key: string, windowStart: number): Promise<BruteForceAttempt[]>
  abstract clearAttempts(key: string): Promise<void>
  abstract getBlockTime(key: string): Promise<number | null>
  abstract setBlock(key: string, blockUntil: number): Promise<void>
  abstract clearBlock(key: string): Promise<void>
  abstract setWhitelist(key: string, expiry?: number): Promise<void>
  abstract setBlacklist(key: string, expiry?: number): Promise<void>
  abstract isWhitelisted(key: string): Promise<boolean>
  abstract isBlacklisted(key: string): Promise<boolean>
  abstract getStatistics(
    since: number,
    until: number,
  ): Promise<{
    totalRequests: number
    blockedRequests: number
    topIPs: Array<{ ip: string; requests: number }>
    topEndpoints: Array<{ endpoint: string; requests: number }>
  }>
}
