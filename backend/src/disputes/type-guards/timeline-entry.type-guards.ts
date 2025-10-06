import {
  TimelineEntry,
  CreatedPayload,
  StateChangePayload,
  CommentPayload,
  EvidencePayload,
  AssignmentPayload,
  NotificationPayload,
  EscalationPayload,
  ResolutionPayload,
  RefundPayload,
  SlaViolationPayload,
  AutoResolutionPayload,
} from '../entities/dispute.entity';

// Type guards for TimelineEntry payload narrowing
export function isCreatedTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'created'; payload: CreatedPayload } {
  return entry.type === 'created';
}

export function isStateChangeTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & {
  type: 'state_change';
  payload: StateChangePayload;
} {
  return entry.type === 'state_change';
}

export function isCommentTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'comment'; payload: CommentPayload } {
  return entry.type === 'comment';
}

export function isEvidenceTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'evidence'; payload: EvidencePayload } {
  return entry.type === 'evidence';
}

export function isAssignmentTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'assignment'; payload: AssignmentPayload } {
  return entry.type === 'assignment';
}

export function isNotificationTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & {
  type: 'notification';
  payload: NotificationPayload;
} {
  return entry.type === 'notification';
}

export function isEscalationTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'escalation'; payload: EscalationPayload } {
  return entry.type === 'escalation';
}

export function isResolutionTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'resolution'; payload: ResolutionPayload } {
  return entry.type === 'resolution';
}

export function isRefundTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & { type: 'refund'; payload: RefundPayload } {
  return entry.type === 'refund';
}

export function isSlaViolationTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & {
  type: 'sla_violation';
  payload: SlaViolationPayload;
} {
  return entry.type === 'sla_violation';
}

export function isAutoResolutionTimelineEntry(
  entry: TimelineEntry,
): entry is TimelineEntry & {
  type: 'auto_resolution';
  payload: AutoResolutionPayload;
} {
  return entry.type === 'auto_resolution';
}

// Generic payload type guard
export function getTimelineEntryPayloadType(entry: TimelineEntry) {
  switch (entry.type) {
    case 'created':
      return 'CreatedPayload';
    case 'state_change':
      return 'StateChangePayload';
    case 'comment':
      return 'CommentPayload';
    case 'evidence':
      return 'EvidencePayload';
    case 'assignment':
      return 'AssignmentPayload';
    case 'notification':
      return 'NotificationPayload';
    case 'escalation':
      return 'EscalationPayload';
    case 'resolution':
      return 'ResolutionPayload';
    case 'refund':
      return 'RefundPayload';
    case 'sla_violation':
      return 'SlaViolationPayload';
    case 'auto_resolution':
      return 'AutoResolutionPayload';
    default:
      return 'UnknownPayload';
  }
}
