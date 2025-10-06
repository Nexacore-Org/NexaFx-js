import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  Between,
  DataSource,
  Not,
  LessThanOrEqual,
} from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { S3Service } from './s3.service';
import {
  Dispute,
  DisputeState,
  DisputePriority,
  DisputeCategory,
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
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';
import { Evidence } from '../entities/evidence.entity';
import { Comment, AuthorType } from '../entities/comment.entity';
import {
  TimelineEntry,
  TimelineEntryType,
} from '../entities/timeline-entry.entity';
import { AuditLog, AuditMetadata } from '../entities/audit-log.entity';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { UpdateDisputeDto } from '../dto/update-dispute.dto';
import { AddCommentDto } from '../dto/add-comment.dto';
import { ResolveDisputeDto } from '../dto/resolve-dispute.dto';
import { AssignDisputeDto } from '../dto/assign-dispute.dto';
import { EscalateDisputeDto } from '../dto/escalate-dispute.dto';

@Injectable()
export class DisputeService {
  constructor(
    @InjectRepository(Dispute)
    private disputeRepository: Repository<Dispute>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Evidence)
    private evidenceRepository: Repository<Evidence>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(TimelineEntry)
    private timelineRepository: Repository<TimelineEntry>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    @InjectQueue('dispute') private disputeQueue: Queue,
    @InjectQueue('notification') private notificationQueue: Queue,
    @InjectQueue('ocr') private ocrQueue: Queue,
    private s3Service: S3Service,
    private dataSource: DataSource,
  ) {}

  async createDispute(
    createDisputeDto: CreateDisputeDto,
    userId: string,
  ): Promise<Dispute> {
    // Validate transaction exists and belongs to user
    const transaction = await this.transactionRepository.findOne({
      where: { id: createDisputeDto.transactionId, userId },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or access denied');
    }

    // Check for existing dispute on same transaction
    const existingDispute = await this.disputeRepository.findOne({
      where: {
        transactionId: createDisputeDto.transactionId,
        state: Not(DisputeState.CANCELLED), // Exclude cancelled disputes
      },
    });

    if (existingDispute && existingDispute.state !== DisputeState.CANCELLED) {
      throw new BadRequestException(
        'Dispute already exists for this transaction',
      );
    }

    // Calculate priority and SLA deadline
    const priority = this.calculatePriority(
      createDisputeDto.amountNaira,
      transaction.user.tier,
    );
    const slaDeadline = this.calculateSlaDeadline(priority);

    // Create dispute
    const dispute = this.disputeRepository.create({
      ...createDisputeDto,
      userId,
      state: DisputeState.OPEN,
      priority,
      slaDeadline,
    });

    const savedDispute = await this.disputeRepository.save(dispute);

    // Create timeline entry
    const createdPayload: CreatedPayload = {
      category: createDisputeDto.category,
      description: createDisputeDto.description || '',
      evidenceCount: 0,
    };
    await this.createTimelineEntry(
      savedDispute.id,
      TimelineEntryType.CREATED,
      userId,
      'user',
      createdPayload,
    );

    // Create audit log
    await this.createAuditLog(
      savedDispute.id,
      userId,
      'user',
      'CREATE_DISPUTE',
      {
        action: 'CREATE_DISPUTE',
        transactionId: createDisputeDto.transactionId,
        category: createDisputeDto.category,
        priority,
      },
    );

    // Queue jobs
    await this.disputeQueue.add('assign-dispute', {
      disputeId: savedDispute.id,
    });
    await this.notificationQueue.add('dispute-created', {
      userId,
      disputeId: savedDispute.id,
      category: createDisputeDto.category,
    });

    return this.findOne(savedDispute.id);
  }

  async findOne(id: string, includeRelations = true): Promise<Dispute> {
    const relations = includeRelations
      ? [
          'transaction',
          'user',
          'assignedTo',
          'evidences',
          'comments',
          'timeline',
        ]
      : [];

    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations,
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  async findByUser(
    userId: string,
    filters?: {
      state?: string;
      category?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<Dispute[]> {
    const where: FindOptionsWhere<Dispute> = { userId };

    if (filters?.state) {
      where.state = filters.state as DisputeState;
    }

    if (filters?.category) {
      where.category = filters.category as DisputeCategory;
    }

    if (filters?.dateFrom && filters?.dateTo) {
      where.createdAt = Between(filters.dateFrom, filters.dateTo);
    }

    return this.disputeRepository.find({
      where,
      relations: ['transaction', 'assignedTo'],
      order: { createdAt: 'DESC' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  }

  async updateDispute(
    id: string,
    updateDisputeDto: UpdateDisputeDto,
    userId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id, false);

    // Check permissions
    if (dispute.userId !== userId) {
      throw new ForbiddenException('You can only update your own disputes');
    }

    // Check if dispute can be updated
    if (!this.canUpdateDispute(dispute.state)) {
      throw new BadRequestException(
        'Dispute cannot be updated in current state',
      );
    }

    // Update dispute
    Object.assign(dispute, updateDisputeDto);
    await this.disputeRepository.save(dispute);

    // Create timeline entry
    const stateChangePayload: StateChangePayload = {
      from: dispute.state,
      to: (updateDisputeDto.state as DisputeState) || dispute.state,
      reason: 'user_update',
    };
    await this.createTimelineEntry(
      id,
      TimelineEntryType.STATE_CHANGE,
      userId,
      'user',
      stateChangePayload,
    );

    // Create audit log
    await this.createAuditLog(id, userId, 'user', 'UPDATE_DISPUTE', {
      action: 'UPDATE_DISPUTE',
      ...updateDisputeDto,
    });

    return this.findOne(id);
  }

  async assignDispute(
    id: string,
    assignDto: AssignDisputeDto,
    agentId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id, false);
    const agent = await this.userRepository.findOne({
      where: { id: assignDto.agentId, isAgent: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // Update dispute
    dispute.assignedToId = assignDto.agentId;
    dispute.state = DisputeState.INVESTIGATING;
    await this.disputeRepository.save(dispute);

    // Create timeline entry
    await this.createTimelineEntry(
      id,
      TimelineEntryType.ASSIGNMENT,
      agentId,
      'agent',
      {
        assignedTo: assignDto.agentId,
        notes: assignDto.notes,
      },
    );

    // Create audit log
    await this.createAuditLog(id, agentId, 'agent', 'ASSIGN_DISPUTE', {
      action: 'ASSIGN_DISPUTE',
      agentId: assignDto.agentId,
      notes: assignDto.notes,
    });

    // Queue notification
    await this.notificationQueue.add('dispute-assigned', {
      agentId: assignDto.agentId,
      disputeId: id,
      assignedBy: agentId,
    });

    return this.findOne(id);
  }

  async resolveDispute(
    id: string,
    resolveDto: ResolveDisputeDto,
    agentId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id, false);

    if (!dispute.assignedToId || dispute.assignedToId !== agentId) {
      throw new ForbiddenException(
        'Only assigned agent can resolve this dispute',
      );
    }

    // Update dispute
    dispute.state = DisputeState.RESOLVED;
    dispute.outcome = resolveDto.outcome;
    dispute.outcomeDetails = resolveDto.outcomeDetails || '';
    dispute.resolutionNotes = resolveDto.resolutionNotes || '';
    dispute.refundAmount = resolveDto.refundAmount
      ? resolveDto.refundAmount.toString()
      : '0';
    dispute.refundTransactionId = resolveDto.refundTransactionId || '';

    await this.disputeRepository.save(dispute);

    // Create timeline entry
    await this.createTimelineEntry(
      id,
      TimelineEntryType.RESOLUTION,
      agentId,
      'agent',
      {
        outcome: resolveDto.outcome,
        outcomeDetails: resolveDto.outcomeDetails,
        refundAmount: resolveDto.refundAmount?.toString(),
      },
    );

    // Create audit log
    await this.createAuditLog(id, agentId, 'agent', 'RESOLVE_DISPUTE', {
      action: 'RESOLVE_DISPUTE',
      outcome: resolveDto.outcome,
      outcomeDetails: resolveDto.outcomeDetails,
      resolutionNotes: resolveDto.resolutionNotes,
      refundAmount: resolveDto.refundAmount,
      refundTransactionId: resolveDto.refundTransactionId,
    });

    // Queue refund job if needed
    if (resolveDto.refundAmount && resolveDto.refundAmount > 0) {
      await this.disputeQueue.add('process-refund', {
        disputeId: id,
        amount: resolveDto.refundAmount,
        reason: resolveDto.outcomeDetails,
      });
    }

    // Queue notification
    await this.notificationQueue.add('dispute-resolved', {
      userId: dispute.userId,
      disputeId: id,
      outcome: resolveDto.outcome,
      refundAmount: resolveDto.refundAmount,
    });

    return this.findOne(id);
  }

  async escalateDispute(
    id: string,
    escalateDto: EscalateDisputeDto,
    agentId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id, false);

    if (dispute.escalationLevel >= 2) {
      throw new BadRequestException('Maximum escalation level reached');
    }

    // Update dispute
    dispute.state = DisputeState.ESCALATED;
    dispute.escalationLevel += 1;
    dispute.escalationReason = escalateDto.reason;
    dispute.assignedToId = null; // Unassign for re-assignment

    await this.disputeRepository.save(dispute);

    // Create timeline entry
    await this.createTimelineEntry(
      id,
      TimelineEntryType.ESCALATION,
      agentId,
      'agent',
      {
        reason: escalateDto.reason,
        targetLevel: escalateDto.targetLevel,
        newLevel: dispute.escalationLevel,
      },
    );

    // Create audit log
    await this.createAuditLog(id, agentId, 'agent', 'ESCALATE_DISPUTE', {
      action: 'ESCALATE_DISPUTE',
      reason: escalateDto.reason,
      escalationLevel: dispute.escalationLevel + 1,
      previousState: dispute.state,
    });

    // Queue for re-assignment
    await this.disputeQueue.add('assign-dispute', {
      disputeId: id,
      escalationLevel: dispute.escalationLevel,
    });

    return this.findOne(id);
  }

  async addComment(
    id: string,
    addCommentDto: AddCommentDto,
    userId: string,
    userType: string,
  ): Promise<Comment> {
    const dispute = await this.findOne(id, false);

    // Convert string to AuthorType enum
    const authorType = this.mapUserTypeToAuthorType(userType);

    const comment = this.commentRepository.create({
      disputeId: id,
      authorId: userId,
      authorType,
      content: addCommentDto.content,
      isInternal: addCommentDto.isInternal || false,
      parentCommentId: addCommentDto.parentCommentId,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Create timeline entry
    await this.createTimelineEntry(
      id,
      TimelineEntryType.COMMENT,
      userId,
      userType,
      {
        commentId: savedComment.id,
        isInternal: addCommentDto.isInternal,
      },
    );

    // Queue notification if not internal
    if (!addCommentDto.isInternal) {
      const targetUserId =
        userType === 'user' ? dispute.assignedToId : dispute.userId;
      if (targetUserId) {
        await this.notificationQueue.add('dispute-comment', {
          userId: targetUserId,
          disputeId: id,
          commentId: savedComment.id,
        });
      }
    }

    return savedComment;
  }

  async uploadEvidence(
    id: string,
    files: Express.Multer.File[],
    userId: string,
  ): Promise<Evidence[]> {
    const evidences: Evidence[] = [];

    for (const file of files) {
      // Upload to S3
      const s3Key = this.s3Service.generateEvidenceKey(id, file.originalname);
      await this.s3Service.uploadFile(file, `evidence/${id}`, {
        disputeId: id,
        uploaderId: userId,
        originalFilename: file.originalname,
      });

      const evidence = this.evidenceRepository.create({
        disputeId: id,
        uploaderId: userId,
        s3Key,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });

      const savedEvidence = await this.evidenceRepository.save(evidence);
      evidences.push(savedEvidence);

      // Queue OCR job
      await this.ocrQueue.add('process-evidence', {
        evidenceId: savedEvidence.id,
        s3Key,
        mimeType: file.mimetype,
      });
    }

    // Create timeline entry
    await this.createTimelineEntry(
      id,
      TimelineEntryType.EVIDENCE,
      userId,
      'user',
      { evidenceCount: evidences.length },
    );

    return evidences;
  }

  async cancelDispute(id: string, userId: string): Promise<Dispute> {
    const dispute = await this.findOne(id, false);

    if (dispute.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own disputes');
    }

    if (!this.canCancelDispute(dispute.state)) {
      throw new BadRequestException(
        'Dispute cannot be cancelled in current state',
      );
    }

    dispute.state = DisputeState.CANCELLED;
    await this.disputeRepository.save(dispute);

    // Create timeline entry
    const stateChangePayload: StateChangePayload = {
      from: dispute.state,
      to: DisputeState.CANCELLED,
      reason: 'user_cancelled',
    };
    await this.createTimelineEntry(
      id,
      TimelineEntryType.STATE_CHANGE,
      userId,
      'user',
      stateChangePayload,
    );

    return this.findOne(id);
  }

  async getPendingDisputes(filters?: {
    priority?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<Dispute[]> {
    const where: FindOptionsWhere<Dispute> = {
      state: DisputeState.OPEN,
    };

    if (filters?.priority) {
      where.priority = filters.priority as DisputePriority;
    }

    if (filters?.category) {
      where.category = filters.category as DisputeCategory;
    }

    return this.disputeRepository.find({
      where,
      relations: ['transaction', 'user'],
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  }

  async getAssignedDisputes(agentId: string): Promise<Dispute[]> {
    return this.disputeRepository.find({
      where: { assignedToId: agentId, state: DisputeState.INVESTIGATING },
      relations: ['transaction', 'user'],
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async getSlaViolations(): Promise<Dispute[]> {
    const now = new Date();

    return this.disputeRepository.find({
      where: [
        { state: DisputeState.OPEN, slaDeadline: Between(new Date(0), now) },
        {
          state: DisputeState.INVESTIGATING,
          slaDeadline: Between(new Date(0), now),
        },
      ],
      relations: ['transaction', 'user', 'assignedTo'],
      order: { slaDeadline: 'ASC' },
    });
  }

  async getStatistics(): Promise<any> {
    const total = await this.disputeRepository.count();
    const byState = await this.disputeRepository
      .createQueryBuilder('dispute')
      .select('dispute.state', 'state')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dispute.state')
      .getRawMany();

    const byCategory = await this.disputeRepository
      .createQueryBuilder('dispute')
      .select('dispute.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dispute.category')
      .getRawMany();

    const avgResolutionTime: { avgHours: string } | undefined =
      await this.disputeRepository
        .createQueryBuilder('dispute')
        .select(
          'AVG(EXTRACT(EPOCH FROM (dispute.updatedAt - dispute.createdAt))/3600)',
          'avgHours',
        )
        .where('dispute.state = :state', { state: DisputeState.RESOLVED })
        .getRawOne();

    return {
      total,
      byState,
      byCategory,
      avgResolutionTimeHours:
        parseFloat(avgResolutionTime?.avgHours || '0') || 0,
    };
  }

  async triggerAutoResolve(id: string): Promise<Dispute> {
    const dispute = await this.findOne(id, false);

    if (dispute.state !== DisputeState.OPEN) {
      throw new BadRequestException('Only open disputes can be auto-resolved');
    }

    // Queue auto-resolution job
    await this.disputeQueue.add('auto-resolve', { disputeId: id });

    return this.findOne(id);
  }

  async getAutoResolvableDisputes(): Promise<Dispute[]> {
    // Find disputes that are eligible for auto-resolution
    return this.disputeRepository.find({
      where: {
        state: DisputeState.OPEN,
        fraudScore: LessThanOrEqual(30), // Low fraud score
      },
      relations: ['evidences'],
      take: 10, // Limit to prevent overload
      order: { createdAt: 'ASC' },
    });
  }

  async cleanupOldResolvedDisputes(beforeDate: Date): Promise<number> {
    const result = await this.disputeRepository
      .createQueryBuilder()
      .delete()
      .where('state = :state', { state: DisputeState.RESOLVED })
      .andWhere('updatedAt < :beforeDate', { beforeDate })
      .execute();

    return result.affected || 0;
  }

  async cleanupOldAuditLogs(beforeDate: Date): Promise<number> {
    const result = await this.auditRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :beforeDate', { beforeDate })
      .execute();

    return result.affected || 0;
  }

  private calculatePriority(
    amount?: string,
    userTier?: number,
  ): DisputePriority {
    if (amount) {
      const numericAmount = parseFloat(amount);
      if (!isNaN(numericAmount)) {
        if (numericAmount > 100000) return DisputePriority.CRITICAL;
        if (numericAmount > 50000) return DisputePriority.HIGH;
      }
    }
    if (userTier && userTier >= 3) return DisputePriority.CRITICAL;
    return DisputePriority.MEDIUM;
  }

  private calculateSlaDeadline(priority: DisputePriority): Date {
    const now = new Date();

    switch (priority) {
      case DisputePriority.CRITICAL:
        return new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      case DisputePriority.HIGH:
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      case DisputePriority.MEDIUM:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case DisputePriority.LOW:
        return new Date(now.getTime() + 48 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  private canUpdateDispute(state: DisputeState): boolean {
    return [DisputeState.OPEN, DisputeState.INVESTIGATING].includes(state);
  }

  private canCancelDispute(state: DisputeState): boolean {
    return [DisputeState.OPEN, DisputeState.INVESTIGATING].includes(state);
  }

  private async createTimelineEntry(
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
  ): Promise<TimelineEntry> {
    const timelineEntry = this.timelineRepository.create({
      disputeId,
      type,
      actorId,
      actorType,
      payload,
    });

    return this.timelineRepository.save(timelineEntry);
  }

  /**
   * Process refund for a resolved dispute
   */
  async processRefund(
    disputeId: string,
    processedBy: string,
    amount?: string,
    reason?: string,
  ): Promise<{ message: string; disputeId: string; jobId?: string }> {
    const dispute = await this.findOne(disputeId, false);

    // Validate dispute state - only resolved disputes can be refunded
    if (dispute.state !== DisputeState.RESOLVED) {
      throw new BadRequestException('Only resolved disputes can be refunded');
    }

    // Validate dispute has refund amount
    const refundAmountNum = parseFloat(dispute.refundAmount);
    if (
      !dispute.refundAmount ||
      isNaN(refundAmountNum) ||
      refundAmountNum <= 0
    ) {
      throw new BadRequestException(
        'Dispute does not have a valid refund amount',
      );
    }

    // Use provided amount or dispute refund amount
    const refundAmount = amount || dispute.refundAmount;

    // Validate refund amount doesn't exceed dispute amount
    const disputeAmount = parseFloat(dispute.amountNaira);
    if (isNaN(disputeAmount)) {
      throw new BadRequestException('Invalid dispute amount format');
    }
    if (amount) {
      const refundAmountNum = parseFloat(amount);
      if (isNaN(refundAmountNum)) {
        throw new BadRequestException('Invalid refund amount format');
      }
      if (refundAmountNum > disputeAmount) {
        throw new BadRequestException(
          'Refund amount cannot exceed dispute amount',
        );
      }
    }

    // Queue refund processing job
    const job = await this.disputeQueue.add('process-refund', {
      disputeId,
      amount: refundAmount,
      reason,
      processedBy,
    });

    // Create timeline entry
    await this.createTimelineEntry(
      disputeId,
      TimelineEntryType.REFUND,
      processedBy,
      'admin',
      {
        refundTransactionId: `REF_${job.id}_${disputeId}`,
        amount: refundAmount,
        reason: reason || 'Refund processing initiated',
        status: 'pending',
      },
    );

    // Create audit log
    await this.createAuditLog(
      disputeId,
      processedBy,
      'admin',
      'REFUND_INITIATED',
      {
        action: 'REFUND_INITIATED',
        refundAmount,
        reason,
        jobId: job.id,
      },
    );

    return {
      message: 'Refund processing initiated',
      disputeId,
      jobId: job.id?.toString(),
    };
  }

  private async createAuditLog(
    disputeId: string,
    actorId: string,
    actorType: string,
    action: string,
    meta: AuditMetadata | null = null,
  ): Promise<AuditLog> {
    const auditLog = this.auditRepository.create({
      disputeId,
      actorId,
      actorType,
      action,
      meta,
    });

    return this.auditRepository.save(auditLog);
  }

  /**
   * Create dispute with evidence files in a single transaction
   * Ensures atomicity - if evidence upload fails, dispute creation is rolled back
   */
  async createDisputeWithEvidence(
    createDisputeDto: CreateDisputeDto,
    files: Express.Multer.File[],
    userId: string,
  ): Promise<Dispute> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate transaction exists and belongs to user
      const transaction = await queryRunner.manager.findOne(Transaction, {
        where: { id: createDisputeDto.transactionId, userId },
        relations: ['user'],
      });

      if (!transaction) {
        await queryRunner.rollbackTransaction();
        throw new NotFoundException('Transaction not found or access denied');
      }

      // Check for existing dispute on same transaction
      const existingDispute = await queryRunner.manager.findOne(Dispute, {
        where: {
          transactionId: createDisputeDto.transactionId,
          state: Not(DisputeState.CANCELLED),
        },
      });

      if (existingDispute && existingDispute.state !== DisputeState.CANCELLED) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException(
          'Dispute already exists for this transaction',
        );
      }

      // Calculate priority and SLA deadline
      const priority = this.calculatePriority(
        createDisputeDto.amountNaira,
        transaction.user.tier,
      );
      const slaDeadline = this.calculateSlaDeadline(priority);

      // Create dispute within transaction
      const dispute = queryRunner.manager.create(Dispute, {
        ...createDisputeDto,
        userId,
        state: DisputeState.OPEN,
        priority,
        slaDeadline,
      });

      const savedDispute = await queryRunner.manager.save(dispute);

      // Create evidence records with pending upload status (inside transaction)
      const evidenceData: Array<{
        evidence: Evidence;
        file: Express.Multer.File;
        s3Key: string;
      }> = [];

      if (files && files.length > 0) {
        for (const file of files) {
          // Generate S3 key but don't upload yet
          const s3Key = this.s3Service.generateEvidenceKey(
            savedDispute.id,
            file.originalname,
          );

          const evidence = queryRunner.manager.create(Evidence, {
            disputeId: savedDispute.id,
            uploaderId: userId,
            s3Key,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            uploadStatus: 'pending',
          });

          const savedEvidence = await queryRunner.manager.save(evidence);
          evidenceData.push({
            evidence: savedEvidence,
            file,
            s3Key,
          });
        }
      }

      // Create timeline entry
      const createdPayload: CreatedPayload = {
        category: createDisputeDto.category,
        description: createDisputeDto.description || '',
        evidenceCount: evidenceData.length,
      };
      const timelineEntry = queryRunner.manager.create(TimelineEntry, {
        disputeId: savedDispute.id,
        type: TimelineEntryType.CREATED,
        actorId: userId,
        actorType: 'user',
        payload: createdPayload,
      });

      await queryRunner.manager.save(timelineEntry);

      // Create audit log
      const auditLog = queryRunner.manager.create(AuditLog, {
        disputeId: savedDispute.id,
        actorId: userId,
        actorType: 'user',
        action: 'CREATE_DISPUTE_WITH_EVIDENCE',
        meta: {
          action: 'CREATE_DISPUTE_WITH_EVIDENCE',
          transactionId: createDisputeDto.transactionId,
          category: createDisputeDto.category,
          priority,
          evidenceCount: evidenceData.length,
        },
      });

      await queryRunner.manager.save(auditLog);

      // Commit the transaction
      await queryRunner.commitTransaction();

      // Upload files to S3 and update evidence status (outside transaction)
      if (evidenceData.length > 0) {
        await this.uploadEvidenceFiles(evidenceData);
      }

      return savedDispute;
    } catch (error) {
      // Rollback transaction on any error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if a user can access evidence for a specific dispute
   * @param userId - The user ID requesting access
   * @param disputeId - The dispute ID
   * @returns Promise<boolean> - Whether the user can access the evidence
   */
  async canAccessEvidence(userId: string, disputeId: string): Promise<boolean> {
    try {
      const dispute = await this.findOne(disputeId, false);
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'isAgent'],
      });

      if (!user) {
        return false;
      }

      // Agents can access any dispute evidence
      if (user.isAgent) {
        return true;
      }

      // Users can only access evidence for their own disputes
      if (dispute.userId === userId) {
        return true;
      }

      // Assigned agents can access evidence for their assigned disputes
      if (dispute.assignedToId === userId) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a user can access evidence for a specific dispute (with admin support)
   * This method accepts the full user object from the request context
   * @param user - The user object from request context (may include isAdmin)
   * @param disputeId - The dispute ID
   * @returns Promise<boolean> - Whether the user can access the evidence
   */
  async canAccessEvidenceWithUser(
    user: { id: string; isAdmin?: boolean; isAgent?: boolean },
    disputeId: string,
  ): Promise<boolean> {
    try {
      const dispute = await this.findOne(disputeId, false);

      // Admin and agents can access any dispute evidence
      if (user.isAdmin || user.isAgent) {
        return true;
      }

      // Users can only access evidence for their own disputes
      if (dispute.userId === user.id) {
        return true;
      }

      // Assigned agents can access evidence for their assigned disputes
      if (dispute.assignedToId === user.id) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private mapUserTypeToAuthorType(userType: string): AuthorType {
    switch (userType.toLowerCase()) {
      case 'agent':
      case 'admin':
      case 'support':
        return AuthorType.AGENT;
      case 'system':
        return AuthorType.SYSTEM;
      case 'user':
      default:
        return AuthorType.USER;
    }
  }

  /**
   * Upload evidence files to S3 and update their status
   * This method runs outside of database transactions to avoid long locks
   */
  private async uploadEvidenceFiles(
    evidenceData: Array<{
      evidence: Evidence;
      file: Express.Multer.File;
      s3Key: string;
    }>,
  ): Promise<void> {
    const uploadPromises = evidenceData.map(
      async ({ evidence, file }) => {
        try {
          // Upload file to S3
          await this.s3Service.uploadFile(
            file,
            `evidence/${evidence.disputeId}`,
            {
              disputeId: evidence.disputeId,
              uploaderId: evidence.uploaderId,
              originalFilename: file.originalname,
            },
          );

          // Update evidence status to completed
          await this.evidenceRepository.update(evidence.id, {
            uploadStatus: 'completed',
            uploadError: undefined,
          });

          // Queue OCR processing for the uploaded evidence
          await this.ocrQueue.add('process-evidence', {
            disputeId: evidence.disputeId,
            evidenceId: evidence.id,
            filename: file.originalname,
            uploaderId: evidence.uploaderId,
          });
        } catch (error: any) {
          // Update evidence status to failed with error message
          await this.evidenceRepository.update(evidence.id, {
            uploadStatus: 'failed',
            uploadError: error?.message || 'Upload failed',
          });

          // Log the error for monitoring
          console.error(
            `Failed to upload evidence file ${file.originalname} for dispute ${evidence.disputeId}`,
            error?.stack,
          );
        }
      },
    );

    // Wait for all uploads to complete (success or failure)
    await Promise.allSettled(uploadPromises);
  }
}
