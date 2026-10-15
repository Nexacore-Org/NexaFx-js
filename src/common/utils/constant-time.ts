import * as crypto from 'crypto';

/**
 * Compares two strings in constant time. Both inputs are hashed to fixed-length
 * digests first, so differing lengths never reach `timingSafeEqual` (which
 * throws on mismatched lengths) and no early-exit path leaks timing.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a ?? '').digest();
  const digestB = crypto.createHash('sha256').update(b ?? '').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}
