/** Cache keys and event names in one place, so invalidation cannot drift from the keys (issue #1393). */
export const CacheKeys = {
  ADMIN_STATS: 'admin-stats',
  SUPPORTED_CURRENCIES: 'supported-currencies',
  walletBalances: (userId: string) => `wallet-balances:${userId}`,
} as const;

export const CacheEvents = {
  TRANSACTION_COMPLETED: 'transactions.completed',
  TRANSACTION_REVERSED: 'transactions.reversed',
  KYC_REVIEWED: 'kyc.reviewed',
  AML_ALERT_CREATED: 'aml.alert.created',
  SUPPORT_TICKET_CREATED: 'support.ticket.created',
  SUPPORT_TICKET_UPDATED: 'support.ticket.updated',
  CURRENCY_UPDATED: 'currency.updated',
} as const;
