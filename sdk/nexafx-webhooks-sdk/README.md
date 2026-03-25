# NexaFx Webhooks SDK

TypeScript helpers for subscribing to NexaFx webhooks and verifying signed deliveries.

## Install

```bash
npm install @nexafx/webhooks-sdk
```

## Usage

```ts
import { WebhookClient } from '@nexafx/webhooks-sdk';

const client = new WebhookClient('https://api.nexafx.com');

const subscription = await client.subscribe({
  url: 'https://example.com/webhooks/nexafx',
  events: ['transaction.created', 'transaction.completed'],
});

const isValid = client.verifySignature({
  secret: process.env.NEXAFX_WEBHOOK_SECRET!,
  payload: rawBody,
  signatureHeader: req.headers['x-nexafx-signature'] as string,
  timestampHeader: req.headers['x-nexafx-timestamp'] as string,
});

if (!isValid) {
  throw new Error('Invalid NexaFx webhook signature');
}
```

## Supported Event Types

- `transaction.created`
- `transaction.processing`
- `transaction.completed`
- `transaction.failed`

## Delivery Headers

- `x-nexafx-event`
- `x-nexafx-timestamp`
- `x-nexafx-signature`
- `x-nexafx-delivery-id`

## Signature Format

NexaFx signs the string `${timestamp}.${rawBody}` using `HMAC-SHA256` and sends the result as:

```txt
sha256=<hex_digest>
```
