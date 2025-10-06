import { createMachine, assign } from 'xstate';
import { DisputePriority } from '../entities/dispute.entity';
import { disputeConfig } from '../config/dispute.config';

export interface DisputeContext {
  disputeId: string;
  userId: string;
  agentId?: string;
  priority: DisputePriority;
  category: string;
  // Optional attributes that may influence priority calculation
  amountNaira?: number;
  openedAt?: Date;
  slaDeadline?: Date;
  escalationLevel: number;
  fraudScore: number;
  isAutoResolvable: boolean;
  outcome?: string;
  refundAmount?: number;
}

// Computes a numeric priority score based on dispute attributes
function computePriorityScore(context: DisputeContext): number {
  let score = 0;

  // Base score by category
  switch (context.category) {
    case 'fraud_suspected':
      score += 70;
      break;
    case 'unauthorized_transaction':
      score += 60;
      break;
    case 'transaction_failed':
      score += 50;
      break;
    case 'service_not_received':
      score += 45;
      break;
    case 'wrong_amount':
      score += 40;
      break;
    case 'duplicate_charge':
      score += 35;
      break;
    case 'technical_error':
      score += 30;
      break;
    default:
      score += 20; // other
  }

  // Fraud score modifier
  const fraud = Number(context.fraudScore || 0);
  if (fraud >= 95) score += 30;
  else if (fraud >= 80) score += 20;
  else if (fraud >= 50) score += 10;

  // Amount modifier (if provided)
  const amount = Number(context.amountNaira || 0);
  if (amount >= 1_000_000) score += 15;
  else if (amount >= 250_000) score += 8;
  else if (amount >= 50_000) score += 4;

  // Age modifier based on openedAt (if provided)
  if (context.openedAt instanceof Date) {
    const hoursOpen = Math.max(
      0,
      (Date.now() - context.openedAt.getTime()) / (1000 * 60 * 60),
    );
    if (hoursOpen >= 72) score += 10;
    else if (hoursOpen >= 24) score += 5;
  }

  // Escalation level influence
  if (
    typeof context.escalationLevel === 'number' &&
    context.escalationLevel > 0
  ) {
    score += Math.min(20, context.escalationLevel * 10);
  }

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Maps numeric score to DisputePriority enum
function mapScoreToPriority(score: number): DisputePriority {
  if (score >= 85) return DisputePriority.CRITICAL;
  if (score >= 65) return DisputePriority.HIGH;
  if (score >= 35) return DisputePriority.MEDIUM;
  return DisputePriority.LOW;
}

export const disputeStateMachine = createMachine(
  {
    id: 'dispute',
    initial: 'draft',
    context: {
      disputeId: '',
      userId: '',
      priority: DisputePriority.MEDIUM,
      category: '',
      escalationLevel: 0,
      fraudScore: 0,
      isAutoResolvable: false,
    },
    states: {
      draft: {
        on: {
          SUBMIT: {
            target: 'open',
            actions: ['setSlaDeadline', 'calculatePriority'],
          },
          CANCEL: 'cancelled',
        },
      },
      open: {
        on: {
          ASSIGN: {
            target: 'investigating',
            actions: ['assignAgent'],
            guard: 'hasAgent',
          },
          AUTO_RESOLVE: {
            target: 'auto-resolving',
            guard: 'isAutoResolvable',
          },
          ESCALATE: {
            target: 'escalated',
            actions: ['incrementEscalation'],
          },
          CANCEL: 'cancelled',
        },
        after: {
          SLA_ESCALATION: {
            target: 'escalated',
            actions: ['escalateDueToSla'],
          },
        },
      },
      investigating: {
        on: {
          RESOLVE: {
            target: 'resolved',
            actions: ['setOutcome'],
          },
          ESCALATE: {
            target: 'escalated',
            actions: ['incrementEscalation'],
          },
          REQUEST_MORE_INFO: 'open',
          CANCEL: 'cancelled',
        },
        after: {
          SLA_ESCALATION: {
            target: 'escalated',
            actions: ['escalateDueToSla'],
          },
        },
      },
      escalated: {
        on: {
          ASSIGN: {
            target: 'investigating',
            actions: ['assignAgent'],
            guard: 'hasAgent',
          },
          RESOLVE: {
            target: 'resolved',
            actions: ['setOutcome'],
          },
          ESCALATE: {
            target: 'critical-escalation',
            actions: ['incrementEscalation'],
            guard: 'canEscalateFurther',
          },
          CANCEL: 'cancelled',
        },
        after: {
          SLA_ESCALATION: {
            target: 'critical-escalation',
            actions: ['escalateDueToSla'],
            guard: 'canEscalateFurther',
          },
        },
      },
      'critical-escalation': {
        on: {
          ASSIGN: {
            target: 'investigating',
            actions: ['assignAgent'],
            guard: 'hasAgent',
          },
          RESOLVE: {
            target: 'resolved',
            actions: ['setOutcome'],
          },
          CANCEL: 'cancelled',
        },
        after: {
          10000: {
            target: 'critical-escalation',
            actions: ['logMaxEscalationReached'],
          },
        },
      },
      'auto-resolving': {
        on: {
          AUTO_RESOLVED: {
            target: 'resolved',
            actions: ['setAutoOutcome'],
          },
          AUTO_FAILED: 'open',
          CANCEL: 'cancelled',
        },
      },
      resolved: {
        on: {
          CLOSE: 'closed',
          REOPEN: 'open',
          APPEAL: 'escalated',
        },
        after: {
          30000: 'closed',
        },
      },
      closed: {
        type: 'final',
      },
      cancelled: {
        type: 'final',
      },
    },
  },
  {
    actions: {
      setSlaDeadline: assign({
        slaDeadline: ({ context }) => {
          const now = new Date();
          switch (context.priority) {
            case DisputePriority.CRITICAL:
              return new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
            case DisputePriority.HIGH:
              return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            case DisputePriority.MEDIUM:
              return new Date(now.getTime() + 24 * 60 * 60 * 1000);
            case DisputePriority.LOW:
              return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
            default:
              return new Date(now.getTime() + 24 * 60 * 60 * 1000);
          }
        },
      }),
      calculatePriority: assign({
        priority: ({ context }) => {
          const score = computePriorityScore(context);
          return mapScoreToPriority(score);
        },
      }),
      assignAgent: assign({
        agentId: ({ event }) =>
          event.type === 'ASSIGN' ? event.agentId : undefined,
      }),
      incrementEscalation: assign({
        escalationLevel: ({ context }) => context.escalationLevel + 1,
      }),
      escalateDueToSla: assign({
        escalationLevel: ({ context }) => context.escalationLevel + 1,
      }),
      setOutcome: assign({
        outcome: ({ event }) =>
          event.type === 'RESOLVE' ? event.outcome : undefined,
        refundAmount: ({ event }) =>
          event.type === 'RESOLVE' ? event.refundAmount : undefined,
      }),
      setAutoOutcome: assign({
        outcome: ({ event }) =>
          event.type === 'AUTO_RESOLVED' ? event.outcome : undefined,
        refundAmount: ({ event }) =>
          event.type === 'AUTO_RESOLVED' ? event.refundAmount : undefined,
      }),
      logMaxEscalationReached: assign({
        escalationLevel: ({ context }) => {
          // Log that max escalation has been reached without incrementing
          console.warn(
            `Dispute ${context.disputeId} has reached maximum escalation level`,
          );
          return context.escalationLevel;
        },
      }),
    },
    guards: {
      hasAgent: ({ context }) => !!context.agentId,
      isAutoResolvable: ({ context }) =>
        context.isAutoResolvable &&
        context.fraudScore <= disputeConfig.autoResolution.fraudScoreThreshold,
      canEscalateFurther: ({ context }) => context.escalationLevel < 2,
    },
    delays: {
      SLA_ESCALATION: ({ context }) => {
        const now = Date.now();
        const deadlineMs =
          context.slaDeadline instanceof Date
            ? context.slaDeadline.getTime()
            : now;
        const delay = deadlineMs - now;
        return delay > 0 ? delay : 0;
      },
    },
  },
);
