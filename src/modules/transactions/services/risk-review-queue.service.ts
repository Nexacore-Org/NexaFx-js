import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RiskReviewEntry {
  transactionId: string;
  userId: string;
  riskScore: number;
  status: ReviewStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

@Injectable()
export class RiskReviewQueueService {
  private readonly logger = new Logger(RiskReviewQueueService.name);

  private readonly queue = new Map<string, RiskReviewEntry>();
  private readonly auditLog: Array<{ transactionId: string; action: string; actor: string; at: Date }> = [];

  enqueue(transactionId: string, userId: string, riskScore: number): RiskReviewEntry {
    const entry: RiskReviewEntry = {
      transactionId,
      userId,
      riskScore,
      status: 'PENDING',
      createdAt: new Date(),
    };
    this.queue.set(transactionId, entry);
    this.logger.log(`Enqueued transaction ${transactionId} with risk score ${riskScore}`);
    return entry;
  }

  getPendingQueue(page = 1, limit = 20): RiskReviewEntry[] {
    return Array.from(this.queue.values())
      .filter((e) => e.status === 'PENDING')
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice((page - 1) * limit, page * limit);
  }

  override(
    transactionId: string,
    actorId: string,
    role: string,
    newScore: number,
    note: string,
  ): RiskReviewEntry {
    if (!['compliance_officer', 'admin'].includes(role)) {
      throw new ForbiddenException('Only compliance officers or admins may override risk scores');
    }

    const entry = this.queue.get(transactionId);
    if (!entry) throw new NotFoundException(`Transaction ${transactionId} not in review queue`);

    const prev = entry.riskScore;
    entry.riskScore = newScore;
    entry.reviewNote = note;
    entry.reviewedBy = actorId;

    this.auditLog.push({
      transactionId,
      action: `Risk score overridden from ${prev} to ${newScore} by ${actorId}: ${note}`,
      actor: actorId,
      at: new Date(),
    });

    return entry;
  }

  approve(transactionId: string, actorId: string): RiskReviewEntry {
    const entry = this.getOrFail(transactionId);
    entry.status = 'APPROVED';
    entry.reviewedBy = actorId;
    entry.reviewedAt = new Date();
    this.logger.log(`Transaction ${transactionId} approved by ${actorId}`);
    return entry;
  }

  reject(transactionId: string, actorId: string, note?: string): RiskReviewEntry {
    const entry = this.getOrFail(transactionId);
    entry.status = 'REJECTED';
    entry.reviewedBy = actorId;
    entry.reviewedAt = new Date();
    if (note) entry.reviewNote = note;
    this.logger.log(`Transaction ${transactionId} rejected by ${actorId}`);
    return entry;
  }

  autoDispose(): { approved: number; escalated: number } {
    const now = new Date();
    let approved = 0;
    let escalated = 0;

    for (const entry of this.queue.values()) {
      if (entry.status !== 'PENDING') continue;

      const ageHours = (now.getTime() - entry.createdAt.getTime()) / 3_600_000;

      if (entry.riskScore < 30 && ageHours >= 1) {
        entry.status = 'APPROVED';
        entry.reviewedBy = 'system';
        entry.reviewedAt = now;
        approved++;
      } else if (entry.riskScore > 70 && ageHours >= 6) {
        entry.reviewNote = 'Auto-escalated: high risk score unreviewed after 6 hours';
        escalated++;
      }
    }

    this.logger.log(`Auto-disposition: ${approved} approved, ${escalated} escalated`);
    return { approved, escalated };
  }

  private getOrFail(transactionId: string): RiskReviewEntry {
    const entry = this.queue.get(transactionId);
    if (!entry) throw new NotFoundException(`Transaction ${transactionId} not in review queue`);
    return entry;
  }
}
