export enum ReportType {
  TRANSACTION_SUMMARY = 'transaction_summary',
  FLAGGED_TRANSACTIONS = 'flagged_transactions',
  USER_ACTIVITY = 'user_activity',
  AUDIT_SNAPSHOT = 'audit_snapshot',
}

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
