/**
 * Shared audit action names (issue #1533). Before this, actions were ad-hoc strings scattered
 * across services (`admin.user.suspended`, `kyc.reviewed`, `account.frozen`), which made the
 * audit log hard to query and easy to misspell.
 */
export const AuditAction = {
  ADMIN_HTTP_REQUEST: 'admin.http_request',
  ADMIN_KYC_FILE_VIEWED: 'admin.kyc.file_viewed',
  ADMIN_EXPORT_CREATED: 'admin.export.created',
  ADMIN_EXPORT_DOWNLOADED: 'admin.export.downloaded',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  SESSION_REVOKED: 'auth.session.revoked',
  SESSIONS_REVOKED_ALL: 'auth.sessions.revoked_all',
  LOGOUT: 'auth.logout',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
