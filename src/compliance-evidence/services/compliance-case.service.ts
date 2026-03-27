import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseStatus, ComplianceCaseEntity, ComplianceCaseStatus } from '../entities/compliance-case.entity';

@Injectable()
export class ComplianceCaseService {
  private readonly logger = new Logger(ComplianceCaseService.name);

  constructor(
    @InjectRepository(ComplianceCaseEntity)
    private readonly caseRepo: Repository<ComplianceCaseEntity>,
  ) {}

  /**
   * Create a compliance case, idempotent per user per rule per calendar day.
   * Subsequent calls for the same user+rule+day will only add new evidence IDs.
   */
  async createOrUpdateCase(params: {
    userId: string;
    ruleTriggered: string;
    evidenceTransactionIds: string[];
  }): Promise<ComplianceCaseEntity> {
    const caseDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let existing = await this.caseRepo.findOne({
      where: {
        userId: params.userId,
        ruleTriggered: params.ruleTriggered,
        caseDate,
      },
    });

    if (existing) {
      // Merge new evidence IDs (de-duplicate)
      const merged = Array.from(
        new Set([...existing.evidenceTransactionIds, ...params.evidenceTransactionIds]),
      );
      existing.evidenceTransactionIds = merged;
      const updated = await this.caseRepo.save(existing);
      this.logger.debug(
        `Updated compliance case ${existing.id} for user ${params.userId} rule ${params.ruleTriggered}`,
      );
      return updated;
    }

    const newCase = this.caseRepo.create({
      userId: params.userId,
      ruleTriggered: params.ruleTriggered,
      evidenceTransactionIds: params.evidenceTransactionIds,
      status: CaseStatus.OPEN,
      caseDate,
    });

    const saved = await this.caseRepo.save(newCase);
    this.logger.warn(
      `AML compliance case created: id=${saved.id} user=${params.userId} rule=${params.ruleTriggered}`,
    );
    return saved;
  }

  /** List cases for admin review */
  async findCases(options: {
    userId?: string;
    ruleTriggered?: string;
    status?: ComplianceCaseStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: ComplianceCaseEntity[]; total: number }> {
    const { userId, ruleTriggered, status, page = 1, limit = 20 } = options;
    const where: Record<string, any> = {};
    if (userId) where.userId = userId;
    if (ruleTriggered) where.ruleTriggered = ruleTriggered;
    if (status) where.status = status;

    const [items, total] = await this.caseRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  /** Admin: update case status */
  async updateStatus(
    caseId: string,
    status: ComplianceCaseStatus,
    reviewedBy: string,
    notes?: string,
  ): Promise<ComplianceCaseEntity> {
    const existing = await this.caseRepo.findOneOrFail({ where: { id: caseId } });
    existing.status = status;
    existing.reviewedBy = reviewedBy;
    existing.reviewedAt = new Date();
    if (notes) existing.notes = notes;
    return this.caseRepo.save(existing);
  }
}
