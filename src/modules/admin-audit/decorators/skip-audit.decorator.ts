import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/** Marks a handler as exempt from admin-audit logging (issue #1384). */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
