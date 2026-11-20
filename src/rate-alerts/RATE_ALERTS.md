# Rate Alerts Module

## REST API

All routes are mounted at `/api/v1/rate-alerts` and require a JWT. The user id always comes from
the access token (`@CurrentUser('sub')`); request bodies cannot set it.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/rate-alerts` | Create an alert for a supported `currencyPair`, `targetRate` and `direction` (`above` / `below`). |
| `GET` | `/rate-alerts?page=1&limit=20` | List the caller's alerts, newest first (`limit <= 100`). |
| `DELETE` | `/rate-alerts/:id` | Deactivate an owned alert (404 for anyone else's id). |
| `GET` | `/rate-alerts/history` | Paginated trigger history for the caller. |

The service rejects unsupported pairs/currencies, non-positive targets, duplicates among active
untriggered alerts and more than `rateAlerts.maxPerUser` (default 20) active alerts per user.

## Alert lifecycle

- `isActive` is the user-controlled lifecycle flag. `DELETE` clears it and stamps `deactivatedAt`.
- `triggered` records that the threshold has fired. It is independent of `isActive`, so a triggered
  alert cannot fire twice but still counts as active until the user removes it.
- `triggeredAt` is stamped by the conditional bulk update when a threshold is crossed.

## Trigger mechanism

`ExchangeRatesService.fetchAndCacheRates()` calls `RateAlertsService.checkThresholds(rates)` with
every successfully refreshed rate. The service ignores non-finite values, evaluates alerts in
per-pair chunks of 500, and performs one conditional bulk update per chunk (`triggered = false`,
`isActive = true`). Only the ids returned by that update emit `rate-alert.triggered`, which prevents
duplicate triggers when two refreshes overlap.

The typed `RateAlertTriggeredEvent` payload is
`{ alertId, userId, currencyPair, rate, targetRate, direction }`. The history module listens for it
and writes a `rate_alert_history` row. Notification delivery is handled separately by consumers of
the same event.
