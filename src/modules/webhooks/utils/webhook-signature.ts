import * as crypto from 'crypto';

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const data = `${timestamp}.${rawBody}`;
  const digest = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Verifies an inbound webhook signature.
 * Returns true if the signature is valid, false otherwise.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  receivedSignature: string,
): boolean {
  const expected = signWebhookPayload(secret, timestamp, rawBody);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(receivedSignature),
    );
  } catch {
    // Buffers of different lengths throw — means signature is definitely wrong
    return false;
  }
}
