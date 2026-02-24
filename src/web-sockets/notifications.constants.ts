export const NOTIFICATION_EVENTS = {
  // Transaction events
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_PENDING: 'transaction.pending',
  TRANSACTION_CONFIRMED: 'transaction.confirmed',
  TRANSACTION_FAILED: 'transaction.failed',
  TRANSACTION_REVERSED: 'transaction.reversed',

  // Multi-sig approval events
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_EXPIRED: 'approval.expired',
  APPROVAL_THRESHOLD_MET: 'approval.threshold_met',

  // Fraud / flag events
  FRAUD_ALERT: 'fraud.alert',
  FRAUD_FLAG_RAISED: 'fraud.flag_raised',
  FRAUD_FLAG_RESOLVED: 'fraud.flag_resolved',
  SUSPICIOUS_ACTIVITY: 'fraud.suspicious_activity',

  // Admin events
  ADMIN_ALERT: 'admin.alert',
  ADMIN_USER_FLAGGED: 'admin.user_flagged',
  ADMIN_SYSTEM_EVENT: 'admin.system_event',

  // Connection events
  CONNECTION_ACK: 'connection.ack',
  MISSED_EVENTS: 'connection.missed_events',
  HEARTBEAT: 'connection.heartbeat',
} as const;

export type NotificationEvent =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export const NOTIFICATION_CHANNELS = {
  USER: (userId: string) => `user:${userId}`,
  ADMIN: () => `admin:global`,
  TRANSACTION: (txId: string) => `transaction:${txId}`,
  FRAUD: () => `fraud:alerts`,
} as const;

export const WS_NAMESPACE = '/notifications';
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MISSED_EVENTS_TTL_SECONDS = 86_400; // 24 hours
export const MAX_MISSED_EVENTS_PER_USER = 200;
export const JWT_WS_HANDSHAKE_TIMEOUT_MS = 10_000;
