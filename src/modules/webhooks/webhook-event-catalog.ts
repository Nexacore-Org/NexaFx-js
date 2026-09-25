// Catalog of events this webhook subsystem can emit (issue #1278).
// Starting point — DTOs and the sandbox service are separate follow-ups.
export const WEBHOOK_EVENT_CATALOG = [
  'transaction.created',
  'transaction.completed',
  'transaction.failed',
  'wallet.balance_updated',
  'dispute.opened',
  'dispute.resolved',
  'webhook.test_fired',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENT_CATALOG)[number];

export function isKnownWebhookEvent(event: string): event is WebhookEventName {
  return (WEBHOOK_EVENT_CATALOG as readonly string[]).includes(event);
}
