import { SetMetadata } from "@nestjs/common"
import type { Request } from "express"

export const RATE_LIMIT_KEY = "rate-limit"

export interface RateLimitOptions {
  limit: number
  windowMs: number
  endpoint?: string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  keyGenerator?: (request: Request) => string
  message?: string
}

/**
 * Apply rate limiting to a route or controller
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options)

/**
 * Apply strict rate limiting for authentication endpoints
 */
export const AuthRateLimit = (options?: Partial<RateLimitOptions>) =>
  SetMetadata(RATE_LIMIT_KEY, {
    limit: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    skipSuccessfulRequests: true,
    message: "Too many authentication attempts",
    ...options,
  })

/**
 * Apply rate limiting for API endpoints
 */
export const ApiRateLimit = (options?: Partial<RateLimitOptions>) =>
  SetMetadata(RATE_LIMIT_KEY, {
    limit: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: "Too many API requests",
    ...options,
  })

/**
 * Apply strict rate limiting for sensitive operations
 */
export const StrictRateLimit = (options?: Partial<RateLimitOptions>) =>
  SetMetadata(RATE_LIMIT_KEY, {
    limit: 3,
    windowMs: 60 * 1000, // 1 minute
    message: "Too many requests for sensitive operation",
    ...options,
  })
