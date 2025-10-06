import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  TimelineEntry,
  TimelineEntryType,
} from '../entities/timeline-entry.entity';
import {
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

@Injectable()
export class TimelineEntryService {
  constructor(
    @InjectRepository(TimelineEntry)
    private timelineRepository: Repository<TimelineEntry>,
  ) {}

  /**
   * Create a timeline entry with automatic payload hash computation
   */
  async createTimelineEntry(
    disputeId: string,
    type: TimelineEntryType,
    actorId: string,
    actorType: string,
    payload:
      | CreatedPayload
      | StateChangePayload
      | CommentPayload
      | EvidencePayload
      | AssignmentPayload
      | NotificationPayload
      | EscalationPayload
      | ResolutionPayload
      | RefundPayload
      | SlaViolationPayload
      | AutoResolutionPayload,
    description?: string,
  ): Promise<TimelineEntry> {
    const timelineEntry = this.timelineRepository.create({
      disputeId,
      type,
      actorId,
      actorType,
      payload,
      description,
    });

    return this.timelineRepository.save(timelineEntry);
  }

  /**
   * Create timeline entry using entity manager (for transactions)
   */
  createTimelineEntryWithManager(
    manager: EntityManager,
    disputeId: string,
    type: TimelineEntryType,
    actorId: string,
    actorType: string,
    payload:
      | CreatedPayload
      | StateChangePayload
      | CommentPayload
      | EvidencePayload
      | AssignmentPayload
      | NotificationPayload
      | EscalationPayload
      | ResolutionPayload
      | RefundPayload
      | SlaViolationPayload
      | AutoResolutionPayload,
    description?: string,
  ): Promise<TimelineEntry> {
    const timelineEntry = manager.create(TimelineEntry, {
      disputeId,
      type,
      actorId,
      actorType,
      payload,
      description,
    });

    return manager.save(TimelineEntry, timelineEntry);
  }

  /**
   * Check if a timeline entry with the same content already exists
   */
  async findDuplicateEntry(
    disputeId: string,
    type: TimelineEntryType,
    payload:
      | CreatedPayload
      | StateChangePayload
      | CommentPayload
      | EvidencePayload
      | AssignmentPayload
      | NotificationPayload
      | EscalationPayload
      | ResolutionPayload
      | RefundPayload
      | SlaViolationPayload
      | AutoResolutionPayload,
  ): Promise<TimelineEntry | null> {
    // Create a temporary entity to compute the payload hash
    const tempEntry = new TimelineEntry();
    tempEntry.payload = payload;
    tempEntry.generatePayloadHash();

    return this.timelineRepository.findOne({
      where: {
        disputeId,
        type,
        payloadHash: tempEntry.payloadHash,
      },
    });
  }
}
