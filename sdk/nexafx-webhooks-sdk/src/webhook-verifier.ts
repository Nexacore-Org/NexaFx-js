import { createHmac, timingSafeEqual } from 'crypto';

export interface VerifySignatureInput {
  secret: string;
  payload: string | Buffer;
  signature: string;
  timestamp: string;
}

export function computeSignature(secret: string, timestamp: string, payload: string | Buffer): string {
  const rawPayload = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  const signedValue = `${timestamp}.${rawPayload}`;
  const digest = createHmac('sha256', secret).update(signedValue).digest('hex');
  return `sha256=${digest}`;
}

export function verifySignature(input: VerifySignatureInput): boolean {
  const expected = computeSignature(input.secret, input.timestamp, input.payload);

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  } catch {
    return false;
  }
}
