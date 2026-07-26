# Rate Alerts Module

## Trigger Mechanism
Rate alerts are checked on each exchange rate update via the `checkThresholds(rates)` method, which is called by the `ExchangeRatesService` whenever new rates are fetched.

## Flow
1. User creates a rate alert via `RateAlertsService.create(userId, currencyPair, targetRate, direction)`
2. On each rate update, `checkThresholds()` compares current rates against all active alerts
3. When a threshold is breached, the alert is marked as `triggered: true` and a `rate-alert.triggered` event is emitted
4. Notifications are dispatched by the notification module listening to this event

## Alert Lifecycle
- Active: alert is evaluated on each rate update
- Triggered: once breached, the alert is disabled (no duplicate triggers)
- Manual deactivation: `RateAlertsService.deactivate(alertId)`
