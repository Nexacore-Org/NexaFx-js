import { Request as ExpressRequest, Response } from 'express';

export const RATE_LIMIT_OPTIONS = 'RATE_LIMIT_OPTIONS';

export const RATE_LIMIT_DEFAULTS = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  statusCode: 429,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: ExpressRequest) => req.ip || 'unknown',
};

export const RATE_LIMIT_TIERS = {
  // Unauthenticated requests
  UNAUTHENTICATED: {
    windowMs: 60 * 1000, // 1 minute
    max: 20,
  },
  // Tier 1 users
  TIER_1: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,
  },
  // Tier 2 users
  TIER_2: {
    windowMs: 60 * 1000, // 1 minute
    max: 120,
  },
  // Tier 3 users
  TIER_3: {
    windowMs: 60 * 1000, // 1 minute
    max: 300,
  },
  // Merchants/API users
  MERCHANT: {
    windowMs: 60 * 1000, // 1 minute
    max: 600,
  },
};

export const ENDPOINT_RATE_LIMITS = {
  // Auth endpoints
  LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
  },
  REGISTER: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
  },
  // Blockchain endpoints
  BLOCKCHAIN_TRANSACTION: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
  },
  // KYC endpoints
  KYC_SUBMIT: {
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    max: 3,
  },
  // Analytics endpoints
  ANALYTICS_EXPORT: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
  },
};
