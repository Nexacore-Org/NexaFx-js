import { BadRequestException } from '@nestjs/common';

const DAY_MS = 86_400_000;

/**
 * Whole (ceiling) days between two dates. Invalid dates throw instead of
 * silently producing NaN, which would bypass every range check downstream.
 */
export function dateDiffInDays(from: string | Date, to: string | Date): number {
  const fromMs = from instanceof Date ? from.getTime() : Date.parse(from);
  const toMs = to instanceof Date ? to.getTime() : Date.parse(to);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new BadRequestException('from and to must be valid ISO-8601 dates');
  }

  return Math.ceil((toMs - fromMs) / DAY_MS);
}
