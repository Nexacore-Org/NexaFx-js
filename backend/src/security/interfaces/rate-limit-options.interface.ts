import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: any;
  statusCode?: number;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
  skip?: (req: Request, res: Response) => boolean;
  store?: any;
}

export interface RateLimitTier {
  tier: string;
  windowMs: number;
  max: number;
  updatedAt: string;
}
