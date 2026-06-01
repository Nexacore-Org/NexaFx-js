# JWT Secret Rotation

## Strategy

The app supports dual-secret JWT verification to allow zero-downtime secret rotation.

- `JWT_SECRET` — the current signing secret (required)
- `JWT_SECRET_PREVIOUS` — the previous secret, accepted during the overlap window (optional)

## How It Works

1. Token verification tries `JWT_SECRET` first.
2. If verification fails and `JWT_SECRET_PREVIOUS` is set, it retries with the previous secret.
3. Tokens verified via the previous secret are transparently re-issued using `JWT_SECRET` and returned in the `X-Refreshed-Token` response header.

## Rotation Procedure

1. Set `JWT_SECRET_PREVIOUS` to the current value of `JWT_SECRET`.
2. Generate a new secret and set it as `JWT_SECRET`.
3. Deploy. Existing sessions continue to work via `JWT_SECRET_PREVIOUS`.
4. After your session TTL has elapsed (all old tokens expired), remove `JWT_SECRET_PREVIOUS`.
5. Deploy again to complete the rotation.