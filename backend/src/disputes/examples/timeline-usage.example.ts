import { TimelineEntry } from '../entities/dispute.entity';
import {
  isCreatedTimelineEntry,
  isStateChangeTimelineEntry,
  isAssignmentTimelineEntry,
  isEvidenceTimelineEntry,
  isRefundTimelineEntry,
} from '../type-guards/timeline-entry.type-guards';

/**
 * Example functions demonstrating how to use the new type-safe TimelineEntry
 * with discriminated unions and type guards.
 */

// Example 1: Processing timeline entries with type guards
export function processTimelineEntry(entry: TimelineEntry): string {
  if (isCreatedTimelineEntry(entry)) {
    // TypeScript now knows entry.payload is CreatedPayload
    return `Dispute created with category: ${entry.payload.category}, evidence count: ${entry.payload.evidenceCount}`;
  }

  if (isStateChangeTimelineEntry(entry)) {
    // TypeScript now knows entry.payload is StateChangePayload
    return `State changed from ${entry.payload.from} to ${entry.payload.to}${entry.payload.reason ? ` (${entry.payload.reason})` : ''}`;
  }

  if (isAssignmentTimelineEntry(entry)) {
    // TypeScript now knows entry.payload is AssignmentPayload
    return `Assigned to ${entry.payload.assignedTo} via ${entry.payload.method}`;
  }

  if (isEvidenceTimelineEntry(entry)) {
    // TypeScript now knows entry.payload is EvidencePayload
    return `Evidence ${entry.payload.action}: ${entry.payload.evidenceId}`;
  }

  if (isRefundTimelineEntry(entry)) {
    // TypeScript now knows entry.payload is RefundPayload
    return `Refund ${entry.payload.status}: ${entry.payload.amount} (${entry.payload.reason})`;
  }

  // Handle other types...
  return `Timeline entry: ${entry.type}`;
}

// Example 2: Filtering timeline entries by type
export function getCreatedTimelineEntries(
  entries: TimelineEntry[],
): Array<TimelineEntry & { type: 'created'; payload: any }> {
  return entries.filter(isCreatedTimelineEntry);
}

export function getStateChangeTimelineEntries(
  entries: TimelineEntry[],
): Array<TimelineEntry & { type: 'state_change'; payload: any }> {
  return entries.filter(isStateChangeTimelineEntry);
}

// Example 3: Creating timeline entries with proper typing
export function createExampleTimelineEntries(): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: '1',
      disputeId: 'dispute-1',
      type: 'created',
      actorId: 'user-1',
      payload: {
        category: 'unauthorized_transaction',
        description: 'I did not authorize this transaction',
        evidenceCount: 2,
      },
      createdAt: new Date(),
    },
    {
      id: '2',
      disputeId: 'dispute-1',
      type: 'state_change',
      actorId: 'agent-1',
      payload: {
        from: 'open',
        to: 'investigating',
        reason: 'agent_assigned',
      },
      createdAt: new Date(),
    },
    {
      id: '3',
      disputeId: 'dispute-1',
      type: 'assignment',
      actorId: 'system',
      payload: {
        assignedTo: 'agent-1',
        method: 'auto-assignment',
        escalationLevel: 0,
      },
      createdAt: new Date(),
    },
  ];

  return entries;
}

// Example 4: Type-safe payload access with exhaustive checking
export function getTimelineEntrySummary(entry: TimelineEntry): string {
  switch (entry.type) {
    case 'created':
      return `Created: ${entry.payload.category} (${entry.payload.evidenceCount} evidence items)`;
    case 'state_change':
      return `State: ${entry.payload.from} → ${entry.payload.to}`;
    case 'assignment':
      return `Assigned to: ${entry.payload.assignedTo} (${entry.payload.method})`;
    case 'evidence':
      return `Evidence: ${entry.payload.action} - ${entry.payload.evidenceId}`;
    case 'refund':
      return `Refund: ${entry.payload.amount} - ${entry.payload.status}`;
    case 'comment':
      return `Comment: ${entry.payload.content.substring(0, 50)}...`;
    case 'notification':
      return `Notification: ${entry.payload.type}`;
    case 'escalation':
      return `Escalated: ${entry.payload.reason} (Level ${entry.payload.escalationLevel})`;
    case 'resolution':
      return `Resolved: ${entry.payload.outcome}`;
    case 'sla_violation':
      return `SLA Violation: Level ${entry.payload.escalationLevel}`;
    case 'auto_resolution':
      return `Auto Resolution: ${entry.payload.status}`;
    default:
      // This should never happen with proper typing, but provides exhaustiveness check
      const _exhaustiveCheck: never = entry;
      throw new Error(
        `Unknown timeline entry type: ${(_exhaustiveCheck as any).type}`,
      );
  }
}
