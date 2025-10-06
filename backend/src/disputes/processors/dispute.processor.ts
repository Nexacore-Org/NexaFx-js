import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Dispute,
  DisputeState,
  DisputePriority,
  DisputeOutcome,
  DisputeCategory,
} from '../entities/dispute.entity';
import { User } from '../entities/user.entity';
import {
  TimelineEntry,
  TimelineEntryType,
} from '../entities/timeline-entry.entity';

@Injectable()
@Processor('dispute')
export class DisputeProcessor {
  private readonly logger = new Logger(DisputeProcessor.name);

  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(TimelineEntry)
    private timelineRepository: Repository<TimelineEntry>,
  ) {}

  @Process('assign-dispute')
  async handleAssignDispute(
    job: Job<{ disputeId: string; escalationLevel?: number }>,
  ) {
    const { disputeId, escalationLevel = 0 } = job.data;

    try {
      const dispute = await this.disputeRepository.findOne({
        where: { id: disputeId },
        relations: ['transaction', 'user'],
      });

      if (!dispute) {
        throw new Error(`Dispute ${disputeId} not found`);
      }

      // Skip if already assigned
      if (dispute.assignedToId) {
        this.logger.log(
          `Dispute ${disputeId} skipped - already assigned to agent ${dispute.assignedToId}`,
        );
        return;
      }

      // Find available agent based on priority and escalation level
      const agent = await this.findAvailableAgent(
        dispute.priority,
        escalationLevel,
      );

      if (agent) {
        // Assign dispute to agent
        dispute.assignedToId = agent.id;
        dispute.state = DisputeState.INVESTIGATING;

        await this.disputeRepository.save(dispute);

        // Create timeline entry
        await this.timelineRepository.save({
          disputeId,
          type: TimelineEntryType.ASSIGNMENT,
          actorType: 'system',
          payload: {
            assignedTo: agent.id,
            method: 'auto-assignment',
            escalationLevel,
          },
        });

        console.log(`Dispute ${disputeId} assigned to agent ${agent.id}`);
      } else {
        // No available agents, escalate or mark for manual assignment
        if (escalationLevel < 2) {
          // Re-queue with higher escalation level
          await job.queue.add(
            'assign-dispute',
            {
              disputeId,
              escalationLevel: escalationLevel + 1,
            },
            { delay: 60000 },
          ); // Retry in 1 minute
        } else {
          // Mark for manual assignment
          await this.timelineRepository.save({
            disputeId,
            type: TimelineEntryType.ASSIGNMENT,
            actorType: 'system',
            payload: {
              status: 'pending_manual_assignment',
              reason: 'no_available_agents',
              escalationLevel,
            },
          });
        }
      }
    } catch (error) {
      console.error(`Error assigning dispute ${disputeId}:`, error);
      throw error;
    }
  }

  @Process('auto-resolve')
  async handleAutoResolve(job: Job<{ disputeId: string }>) {
    const { disputeId } = job.data;

    try {
      const dispute = await this.disputeRepository.findOne({
        where: { id: disputeId },
        relations: ['transaction', 'evidences'],
      });

      if (!dispute) {
        throw new Error(`Dispute ${disputeId} not found`);
      }

      // Check if dispute is eligible for auto-resolution
      const autoResolutionResult = this.checkAutoResolutionEligibility(dispute);

      if (autoResolutionResult.eligible) {
        if (
          !autoResolutionResult.outcome ||
          !autoResolutionResult.details ||
          autoResolutionResult.refundAmount === undefined
        ) {
          throw new Error(
            'Invalid auto-resolution result: missing required fields',
          );
        }

        await this.disputeRepository.manager.transaction(
          async (transactionalEntityManager) => {
            // Auto-resolve the dispute
            dispute.state = DisputeState.RESOLVED;
            dispute.outcome = autoResolutionResult.outcome as DisputeOutcome;
            dispute.outcomeDetails = autoResolutionResult.details as string;
            dispute.refundAmount = autoResolutionResult.refundAmount
              ? autoResolutionResult.refundAmount.toString()
              : '0';

            await transactionalEntityManager.save(dispute);

            // Create timeline entry
            await transactionalEntityManager.save(TimelineEntry, {
              disputeId,
              type: TimelineEntryType.AUTO_RESOLUTION,
              actorType: 'system',
              payload: {
                outcome: autoResolutionResult.outcome,
                details: autoResolutionResult.details,
                refundAmount: autoResolutionResult.refundAmount,
                reason: autoResolutionResult.reason,
              },
            });
          },
        );

        console.log(
          `Dispute ${disputeId} auto-resolved with outcome: ${autoResolutionResult.outcome}`,
        );
      } else {
        // Mark as not auto-resolvable
        await this.timelineRepository.save({
          disputeId,
          type: TimelineEntryType.AUTO_RESOLUTION,
          actorType: 'system',
          payload: {
            status: 'not_eligible',
            reason: autoResolutionResult.reason,
          },
        });
      }
    } catch (error) {
      console.error(`Error auto-resolving dispute ${disputeId}:`, error);
      throw error;
    }
  }

  @Process('process-refund')
  async handleProcessRefund(
    job: Job<{ disputeId: string; amount: string; reason: string }>,
  ) {
    const { disputeId, amount, reason } = job.data;

    try {
      // TODO: Integrate with your payment system (Stellar network)
      // This is a placeholder for the actual refund processing

      const dispute = await this.disputeRepository.findOne({
        where: { id: disputeId },
        relations: ['transaction'],
      });

      if (!dispute) {
        throw new Error(`Dispute ${disputeId} not found`);
      }

      // Generate refund transaction ID
      const refundTransactionId = `REF_${uuidv4()}_${disputeId}`;

      // Update dispute with refund transaction ID
      dispute.refundTransactionId = refundTransactionId;
      await this.disputeRepository.save(dispute);

      // Create timeline entry
      await this.timelineRepository.save({
        disputeId,
        type: TimelineEntryType.REFUND,
        actorType: 'system',
        payload: {
          refundTransactionId,
          amount,
          reason,
          status: 'processed',
        },
      });

      console.log(`Refund processed for dispute ${disputeId}: ${amount} NGN`);
    } catch (error) {
      console.error(`Error processing refund for dispute ${disputeId}:`, error);
      throw error;
    }
  }

  @Process('sla-check')
  async handleSlaCheck() {
    try {
      const now = new Date();

      // Find disputes that are violating SLA
      const slaViolations = await this.disputeRepository
        .createQueryBuilder('dispute')
        .where('dispute.slaDeadline < :now', { now })
        .andWhere('dispute.state IN (:...states)', {
          states: [DisputeState.OPEN, DisputeState.INVESTIGATING],
        })
        .getMany();

      const MAX_ESCALATION_LEVEL = 5;

      for (const dispute of slaViolations) {
        await this.disputeRepository.manager.transaction(
          async (transactionalEntityManager) => {
            // Escalate the dispute
            dispute.state = DisputeState.ESCALATED;
            dispute.escalationLevel = Math.min(
              dispute.escalationLevel + 1,
              MAX_ESCALATION_LEVEL,
            );
            dispute.escalationReason = 'SLA violation';

            await transactionalEntityManager.save(dispute);

            // Create timeline entry
            await transactionalEntityManager.save(TimelineEntry, {
              disputeId: dispute.id,
              type: TimelineEntryType.SLA_VIOLATION,
              actorType: 'system',
              payload: {
                slaDeadline: dispute.slaDeadline,
                violationTime: now,
                escalationLevel: dispute.escalationLevel,
              },
            });
          },
        );

        console.log(`SLA violation detected for dispute ${dispute.id}`);
      }

      console.log(
        `SLA check completed. Found ${slaViolations.length} violations.`,
      );
    } catch (error) {
      console.error('Error in SLA check:', error);
      throw error;
    }
  }

  private async findAvailableAgent(
    priority: DisputePriority,
    escalationLevel: number,
  ): Promise<User | null> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .where('user.isAgent = :isAgent', { isAgent: true })
      .leftJoin(
        'user.assignedDisputes',
        'dispute',
        'dispute.state IN (:...states)',
        {
          states: [DisputeState.INVESTIGATING, DisputeState.ESCALATED],
        },
      )
      .groupBy('user.id')
      .having(
        'COUNT(dispute.id) < user.maxConcurrentDisputes OR user.maxConcurrentDisputes IS NULL',
      )
      .orderBy('COUNT(dispute.id)', 'ASC');

    // Filter by agent level based on escalation
    let eligibleLevels: string[];
    if (escalationLevel === 0) {
      eligibleLevels = ['L1', 'L2', 'L3'];
    } else if (escalationLevel === 1) {
      eligibleLevels = ['L2', 'L3'];
    } else {
      eligibleLevels = ['L3'];
    }

    // Filter by priority handling capability
    if (priority === DisputePriority.CRITICAL) {
      eligibleLevels = eligibleLevels.filter(
        (level) => level === 'L2' || level === 'L3',
      );
    }

    query.andWhere('user.agentLevel IN (:...levels)', {
      levels: eligibleLevels,
    });

    return query.getOne();
  }

  private checkAutoResolutionEligibility(dispute: Dispute): {
    eligible: boolean;
    outcome?: string;
    details?: string;
    refundAmount?: number;
    reason?: string;
  } {
    // Check fraud score first - high fraud scores require manual review
    if (dispute.fraudScore > 80) {
      return {
        eligible: false,
        reason: 'high_fraud_score',
      };
    }

    // Check for duplicate charge with evidence
    if (dispute.category === DisputeCategory.DUPLICATE_CHARGE) {
      return this.checkDuplicateChargeEligibility(dispute);
    }

    // Check for technical errors with system confirmation
    if (dispute.category === DisputeCategory.TECHNICAL_ERROR) {
      return this.checkTechnicalErrorEligibility(dispute);
    }

    // Check for unauthorized transactions with low fraud score
    if (dispute.category === DisputeCategory.UNAUTHORIZED_TRANSACTION) {
      return this.checkUnauthorizedTransactionEligibility(dispute);
    }

    // Check for wrong amount disputes
    if (dispute.category === DisputeCategory.WRONG_AMOUNT) {
      return this.checkWrongAmountEligibility(dispute);
    }

    // Check for small amount disputes that might be auto-resolvable
    const amount = parseFloat(dispute.amountNaira);
    if (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= 10000 &&
      dispute.fraudScore < 30
    ) {
      return {
        eligible: true,
        outcome: 'user_favor',
        details: 'Auto-resolved due to low amount and fraud score',
        refundAmount: amount,
        reason: 'low_risk_small_amount',
      };
    }

    return {
      eligible: false,
      reason: 'requires_manual_review',
    };
  }

  private checkDuplicateChargeEligibility(dispute: Dispute): {
    eligible: boolean;
    outcome?: string;
    details?: string;
    refundAmount?: number;
    reason?: string;
  } {
    // Check if we have evidence
    if (!dispute.evidences || dispute.evidences.length === 0) {
      return {
        eligible: false,
        reason: 'no_evidence_provided',
      };
    }

    // Check if evidence contains duplicate transaction references
    const hasDuplicateEvidence = dispute.evidences.some((evidence) => {
      if (!evidence.ocrText) return false;

      // Look for duplicate transaction patterns in OCR text
      const duplicatePatterns = [
        /duplicate/i,
        /same.*transaction/i,
        /charged.*twice/i,
        /double.*charge/i,
      ];

      return duplicatePatterns.some((pattern) =>
        pattern.test(evidence.ocrText || ''),
      );
    });

    if (hasDuplicateEvidence) {
      const amount = parseFloat(dispute.amountNaira);

      if (!Number.isFinite(amount) || amount <= 0) {
        // Log the invalid amount for manual review
        console.warn(
          `Invalid dispute amount for duplicate charge detection: "${dispute.amountNaira}" (parsed as: ${amount})`,
          { disputeId: dispute.id, amountNaira: dispute.amountNaira },
        );

        return {
          eligible: false,
          outcome: 'requires_manual_review',
          details: `Invalid amount format for duplicate charge: "${dispute.amountNaira}". Manual review required.`,
          reason: 'invalid_amount_format',
        };
      }

      return {
        eligible: true,
        outcome: 'user_favor',
        details: 'Evidence shows duplicate charge - auto-resolved',
        refundAmount: amount,
        reason: 'duplicate_charge_confirmed',
      };
    }

    return {
      eligible: false,
      reason: 'duplicate_charge_not_confirmed',
    };
  }

  private checkTechnicalErrorEligibility(dispute: Dispute): {
    eligible: boolean;
    outcome?: string;
    details?: string;
    refundAmount?: number;
    reason?: string;
  } {
    // Check if we have system logs or evidence of technical failure
    if (!dispute.evidences || dispute.evidences.length === 0) {
      return {
        eligible: false,
        reason: 'no_evidence_provided',
      };
    }

    // Check if evidence shows technical error patterns
    const hasTechnicalErrorEvidence = dispute.evidences.some((evidence) => {
      if (!evidence.ocrText) return false;

      const technicalErrorPatterns = [
        /system.*error/i,
        /transaction.*failed/i,
        /network.*error/i,
        /timeout/i,
        /connection.*lost/i,
        /server.*error/i,
      ];

      return technicalErrorPatterns.some((pattern) =>
        pattern.test(evidence.ocrText || ''),
      );
    });

    if (hasTechnicalErrorEvidence) {
      const amount = parseFloat(dispute.amountNaira);

      if (!Number.isFinite(amount) || amount <= 0) {
        // Log the invalid amount for manual review
        console.warn(
          `Invalid dispute amount for technical error detection: "${dispute.amountNaira}" (parsed as: ${amount})`,
        );
        return {
          eligible: false,
          reason: 'invalid_amount',
        };
      }

      return {
        eligible: true,
        outcome: 'user_favor',
        details: 'Technical error confirmed - auto-resolved',
        refundAmount: amount,
        reason: 'technical_error_confirmed',
      };
    }

    return {
      eligible: false,
      reason: 'technical_error_not_confirmed',
    };
  }

  private checkUnauthorizedTransactionEligibility(dispute: Dispute): {
    eligible: boolean;
    outcome?: string;
    details?: string;
    refundAmount?: number;
    reason?: string;
  } {
    // For unauthorized transactions, we need to be very careful
    // Only auto-resolve if fraud score is very low and amount is small
    const amount = parseFloat(dispute.amountNaira);

    if (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= 5000 &&
      dispute.fraudScore < 20
    ) {
      // Check if there's evidence of unauthorized access
      const hasUnauthorizedEvidence = dispute.evidences?.some((evidence) => {
        if (!evidence.ocrText) return false;

        const unauthorizedPatterns = [
          /unauthorized/i,
          /not.*authorized/i,
          /did.*not.*make/i,
          /fraudulent/i,
          /stolen.*card/i,
        ];

        return unauthorizedPatterns.some((pattern) =>
          pattern.test(evidence.ocrText || ''),
        );
      });

      if (hasUnauthorizedEvidence) {
        return {
          eligible: true,
          outcome: 'user_favor',
          details: 'Unauthorized transaction confirmed - auto-resolved',
          refundAmount: amount,
          reason: 'unauthorized_transaction_confirmed',
        };
      }
    }

    return {
      eligible: false,
      reason: 'unauthorized_transaction_requires_manual_review',
    };
  }

  private checkWrongAmountEligibility(dispute: Dispute): {
    eligible: boolean;
    outcome?: string;
    details?: string;
    refundAmount?: number;
    reason?: string;
  } {
    // Check if we have evidence showing the correct amount
    if (!dispute.evidences || dispute.evidences.length === 0) {
      return {
        eligible: false,
        reason: 'no_evidence_provided',
      };
    }

    const amount = parseFloat(dispute.amountNaira);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        eligible: false,
        reason: 'invalid_amount',
      };
    }

    // Look for amount discrepancies in evidence
    const hasAmountEvidence = dispute.evidences.some((evidence) => {
      if (!evidence.ocrText) return false;

      // Extract amounts from OCR text
      const amountRegex = /₦\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
      const matches = evidence.ocrText.match(amountRegex);

      if (matches) {
        const extractedAmounts = matches.map((match) => {
          const numericMatch = match.replace(/[₦,\s]/g, '');
          return parseFloat(numericMatch);
        });

        // Check if any extracted amount is different from dispute amount
        return extractedAmounts.some(
          (extractedAmount) => Math.abs(extractedAmount - amount) > 0.01,
        );
      }

      return false;
    });

    if (hasAmountEvidence) {
      return {
        eligible: true,
        outcome: 'user_favor',
        details: 'Amount discrepancy confirmed - auto-resolved',
        refundAmount: amount,
        reason: 'wrong_amount_confirmed',
      };
    }

    return {
      eligible: false,
      reason: 'wrong_amount_not_confirmed',
    };
  }
}
