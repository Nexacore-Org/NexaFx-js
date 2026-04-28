import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ComplianceCaseEntity, CaseStatus } from '../entities/compliance-case.entity';

const SLA_ESCALATION_HOURS = 48;

@Injectable()
export class CaseSlaJob {
  private readonly logger = new Logger(CaseSlaJob.name);
  private readonly processedIds = new Set<string>();

  constructor(
    @InjectRepository(ComplianceCaseEntity)
    private readonly caseRepo: Repository<ComplianceCaseEntity>,
  ) {}

  async runEscalation(): Promise<{ escalated: number }> {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - SLA_ESCALATION_HOURS);

    const staleCases = await this.caseRepo.find({
      where: {
        status: CaseStatus.OPEN,
        createdAt: LessThan(threshold),
      },
    });

    let escalated = 0;

    for (const c of staleCases) {
      if (this.processedIds.has(c.id)) continue;

      c.status = CaseStatus.ESCALATED;
      await this.caseRepo.save(c);

      this.processedIds.add(c.id);
      escalated++;

      this.logger.warn(
        `Case ${c.id} escalated — open for more than ${SLA_ESCALATION_HOURS}h without action`,
      );
    }

    if (escalated > 0) {
      this.logger.log(`SLA job complete: ${escalated} case(s) escalated`);
    }

    return { escalated };
  }

  clearProcessedCache(): void {
    this.processedIds.clear();
  }
}
