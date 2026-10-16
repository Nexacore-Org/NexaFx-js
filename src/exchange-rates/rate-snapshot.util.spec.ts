import { toOhlc, truncateToHour, withinPeriod, RatePoint } from './rate-snapshot.util';

const at = (iso: string, rate: number): RatePoint => ({ rate, recordedAt: new Date(iso) });

describe('toOhlc (#1378)', () => {
  it('builds one candle per hour with open/high/low/close in time order', () => {
    const candles = toOhlc([
      // deliberately unsorted input
      at('2026-05-01T10:50:00Z', 1.3),
      at('2026-05-01T10:05:00Z', 1.0),
      at('2026-05-01T10:30:00Z', 1.6),
      at('2026-05-01T11:10:00Z', 2.0),
      at('2026-05-01T12:00:00Z', 1.9),
      at('2026-05-01T12:59:00Z', 1.1),
    ]);

    expect(candles).toEqual([
      { bucket: '2026-05-01T10:00:00.000Z', open: 1.0, high: 1.6, low: 1.0, close: 1.3 },
      { bucket: '2026-05-01T11:00:00.000Z', open: 2.0, high: 2.0, low: 2.0, close: 2.0 },
      { bucket: '2026-05-01T12:00:00.000Z', open: 1.9, high: 1.9, low: 1.1, close: 1.1 },
    ]);
  });

  it('returns no candles for no points (empty groups are skipped)', () => {
    expect(toOhlc([])).toEqual([]);
  });

  it('every candle field is a number', () => {
    for (const candle of toOhlc([at('2026-05-01T10:05:00Z', 1.0)])) {
      expect(typeof candle.open).toBe('number');
      expect(typeof candle.close).toBe('number');
    }
  });
});

describe('rate snapshot helpers', () => {
  it('truncates to the top of the hour', () => {
    expect(truncateToHour(new Date('2026-05-01T10:59:59Z')).toISOString()).toBe('2026-05-01T10:00:00.000Z');
  });

  it('drops points outside the trailing window', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const kept = withinPeriod([at('2026-05-01T11:30:00Z', 1), at('2026-05-01T09:00:00Z', 2)], '1h', now);
    expect(kept.map((p) => p.rate)).toEqual([1]);
  });
});
