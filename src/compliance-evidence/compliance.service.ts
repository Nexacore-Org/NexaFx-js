import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { ComplianceCase, CaseStatus } from '../entities/compliance-case.entity';
import { CaseEvent, EventType } from '../entities/case-event.entity';

@Injectable()
export class ComplianceCaseService {
  constructor(
    @InjectRepository(ComplianceCase)
    private caseRepo: Repository<ComplianceCase>,
    @InjectRepository(CaseEvent)
    private eventRepo: Repository<CaseEvent>,
  ) {}

  async getCases(filters: { status?: CaseStatus; assignedTo?: string; startDate?: Date; endDate?: Date }, page = 1, limit = 10) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters.startDate && filters.endDate) {
      where.createdAt = Between(filters.startDate, filters.endDate);
    }

    const [cases, total] = await this.caseRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data: cases, total, page, limit };
  }

  async assignOfficer(caseId: string, officerId: string) {
    const complianceCase = await this.caseRepo.findOne({ where: { id: caseId } });
    if (!complianceCase) throw new NotFoundException('Case not found');

    complianceCase.assignedTo = officerId;
    complianceCase.status = CaseStatus.IN_PROGRESS;
    await this.caseRepo.save(complianceCase);

    await this.appendEvent(caseId, EventType.ASSIGNED, { assignedTo: officerId });
    await this.appendEvent(caseId, EventType.STATUS_CHANGE, { newStatus: CaseStatus.IN_PROGRESS });

    return complianceCase;
  }

  async addNote(caseId: string, note: string, authorId: string) {
    await this.appendEvent(caseId, EventType.NOTE_ADDED, { note, authorId });
    return { success: true };
  }

  async resolveCase(caseId: string, resolutionType: string, summary: string) {
    const complianceCase = await this.caseRepo.findOne({ where: { id: caseId } });
    if (!complianceCase) throw new NotFoundException('Case not found');

    complianceCase.status = CaseStatus.RESOLVED;
    complianceCase.resolutionType = resolutionType;
    complianceCase.resolutionSummary = summary;
    await this.caseRepo.save(complianceCase);

    await this.appendEvent(caseId, EventType.RESOLVED, { resolutionType, summary });
    await this.appendEvent(caseId, EventType.STATUS_CHANGE, { newStatus: CaseStatus.RESOLVED });

    return complianceCase;
  }

  async autoEscalateCases(slaHours: number) {
    const deadline = new Date(Date.now() - slaHours * 60 * 60 * 1000);
    const overdueCases = await this.caseRepo.find({
      where: [
        { status: CaseStatus.OPEN, createdAt: LessThan(deadline) },
        { status: CaseStatus.IN_PROGRESS, updatedAt: LessThan(deadline) }
      ]
    });

    for (const overdue of overdueCases) {
      overdue.status = CaseStatus.ESCALATED;
      await this.caseRepo.save(overdue);
      await this.appendEvent(overdue.id, EventType.ESCALATED, { reason: 'SLA breached' });
      await this.appendEvent(overdue.id, EventType.STATUS_CHANGE, { newStatus: CaseStatus.ESCALATED });
    }
  }

  private async appendEvent(caseId: string, eventType: EventType, payload: any) {
    const event = this.eventRepo.create({ caseId, eventType, payload });
    return this.eventRepo.save(event);
  }
}