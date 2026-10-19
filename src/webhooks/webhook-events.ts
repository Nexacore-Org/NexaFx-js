/**
 * Customer-facing webhook event allowlist (#1444).
 *
 * Only events listed here can be subscribed to on a user-owned endpoint or
 * delivered to one. Compliance-only events (AML alerts, internal KYC review
 * outcomes) must never reach customer webhooks: `aml.alert.created` in
 * particular would break AML tipping-off rules, and platform-wide transfer
 * events previously leaked every tenant's data to any subscriber.
 */

/** Events a customer endpoint may subscribe to and receive. */
export const CUSTOMER_WEBHOOK_EVENTS = [
  'transactions.completed',
  'transactions.deposit.completed',
  'transactions.withdrawal.completed',
  'transactions.swap.completed',
  'transactions.swap.failed',
  'transactions.reversed',
] as const;

export type CustomerWebhookEvent = (typeof CUSTOMER_WEBHOOK_EVENTS)[number];

/** Events that are internal/compliance-only and must never be user-delivered. */
export const INTERNAL_ONLY_WEBHOOK_EVENTS = [
  'aml.alert.created',
  'kyc.reviewed',
] as const;

export type InternalOnlyWebhookEvent =
  (typeof INTERNAL_ONLY_WEBHOOK_EVENTS)[number];

export function isCustomerWebhookEvent(
  event: string,
): event is CustomerWebhookEvent {
  return (CUSTOMER_WEBHOOK_EVENTS as readonly string[]).includes(event);
}

export function isInternalOnlyWebhookEvent(
  event: string,
): event is InternalOnlyWebhookEvent {
  return (INTERNAL_ONLY_WEBHOOK_EVENTS as readonly string[]).includes(event);
}
