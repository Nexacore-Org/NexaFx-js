# Verifying webhook deliveries

NexaFx signs every delivery with the endpoint secret generated at endpoint
creation. That secret is returned **once** in the `POST /webhooks/endpoints`
response; list/get never return it. Treat it like a password.

## Headers

| Header | Value |
| --- | --- |
| `X-Nexafx-Timestamp` | Unix time in milliseconds when the request was signed |
| `X-Nexafx-Signature` | `hex(HMAC-SHA256(secret, timestamp + "." + rawBody))` |
| `X-Nexafx-Legacy-Signature` | `hex(HMAC-SHA256(secret, rawBody))` (migration window only) |

`X-Nexafx-Signature` is the authoritative header. The legacy header lets
existing receivers keep verifying during the migration; new receivers should
use the timestamped signature.

## Verification (Node.js)

Use the **raw request body**, before JSON parsing or reserialisation:

```js
const crypto = require('crypto');

const MAX_AGE_MS = 5 * 60 * 1000;

function verify(rawBody, headers, secret) {
  const timestamp = headers['x-nexafx-timestamp'];
  const signature = headers['x-nexafx-signature'];
  if (!timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > MAX_AGE_MS) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Reject stale timestamps (the example uses five minutes) to prevent replay of a
captured delivery. Return a non-2xx response quickly if verification fails.

## Transport hardening

The delivery worker resolves both A and AAAA records immediately before each
send, rejects private, loopback, link-local, unique-local, IPv4-mapped, CGNAT
and similar addresses, and connects **only** to the validated IP via a pinned
`lookup` callback. Redirects are not followed (`maxRedirects: 0`), so a public
host cannot 302 the request to a metadata endpoint. A 3xx response is treated
as a delivery failure.
