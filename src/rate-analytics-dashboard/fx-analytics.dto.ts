import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum OhlcGranularity {
  ONE_HOUR = '1h',
  ONE_DAY = '1d',
  ONE_WEEK = '1w',
}

// ─── Query DTOs ───────────────────────────────────────────────────────────────

export class HistoryQueryDto {
  @IsOptional()
  @IsEnum(OhlcGranularity, { message: 'granularity must be one of 1h | 1d | 1w' })
  granularity?: OhlcGranularity = OhlcGranularity.ONE_HOUR;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ProviderConfidenceDto {
  provider: string;
  confidence: number;           // 0–1
  circuitBreakerState: string;
}

export interface LiveRateDto {
  pair: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadPct: number;
  providers: ProviderConfidenceDto[];
  timestamp: string;
}

export interface OhlcBarDto {
  time: string;       // ISO bucket start
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  spread: number;
  spreadPct: number;
  sampleCount: number;
  confidenceScore: number;
}

export interface OhlcHistoryResponseDto {
  pair: string;
  granularity: OhlcGranularity;
  total: number;
  limit: number;
  offset: number;
  bars: OhlcBarDto[];
}

export interface ProviderHealthDto {
  provider: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptimePct: number;
  avgLatencyMs: number;
  errorRate1h: number;         // fraction, e.g. 0.22 = 22%
  requestCount1h: number;
  errorCount1h: number;
  circuitBreakerState: string;
  lastTrippedAt: string | null;
  lastSuccessAt: string | null;
}
