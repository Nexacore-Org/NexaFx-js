import * as crypto from 'crypto';

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
) {
  const data = `${timestamp}.${rawBody}`;
  const digest = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `sha256=${digest}`;
}
