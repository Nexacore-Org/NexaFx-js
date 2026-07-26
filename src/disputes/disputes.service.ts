import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DisputeEntity } from './entities/dispute.entity';
import { DisputeMessageEntity } from './entities/dispute-message.entity';
import { Dispute, DisputeStatus } from './dispute.entity';
import { FileDisputeDto, DisputeMessageDto, EscalateDisputeDto } from './dto/dispute.dto';
import { TransactionStatus } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';

export interface OpenDisputeDto {
  transactionId: string;
  userId: string;
  reason: string;
}

export interface ResolveDisputeDto {
  status: DisputeStatus.RESOLVED | DisputeStatus.REJECTED;
  resolution: string;
}

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(DisputeEntity)
    private readonly disputeRepo: Repository<DisputeEntity>,
    @InjectRepository(DisputeMessageEntity)
    private readonly messageRepo: Repository<DisputeMessageEntity>,
    @InjectRepository(Dispute)
    private readonly disputeV2Repo: Repository<Dispute>,
    private readonly transactionsService: TransactionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async fileDispute(userId: string, dto: FileDisputeDto) {
    const dispute = this.disputeRepo.create({
      userId,
      transactionId: dto.transactionId,
      reason: dto.reason,
      description: dto.description,
      status: 'open',
      escalationLevel: 1,
    });

    const saved = await this.disputeRepo.save(dispute);

    // Auto-create initial message
    const message = this.messageRepo.create({
      disputeId: saved.id,
      senderId: userId,
      senderRole: 'user',
      message: dto.description || dto.reason,
    });
    await this.messageRepo.save(message);

    this.eventEmitter.emit('dispute.filed', {
      disputeId: saved.id,
      userId,
      transactionId: dto.transactionId,
    });

    return {
      success: true,
      data: saved,
    };
  }

  async findAllByUser(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [items, total] = await this.disputeRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const dispute = await this.disputeRepo.findOne({
      where: { id, userId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const messages = await this.messageRepo.find({
      where: { disputeId: id },
      order: { createdAt: 'ASC' },
    });

    return {
      success: true,
      data: {
        ...dispute,
        messages,
      },
    };
  }

  async escalate(id: string, userId: string, dto: EscalateDisputeDto) {
    const dispute = await this.disputeRepo.findOne({
      where: { id, userId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new Error('Cannot escalate a resolved or rejected dispute');
    }

    dispute.escalationLevel += 1;
    dispute.status = 'escalated';
    if (dto.assignTo) {
      dispute.assignedTo = dto.assignTo;
    }

    const updated = await this.disputeRepo.save(dispute);

    // Log escalation message
    const message = this.messageRepo.create({
      disputeId: id,
      senderId: userId,
      senderRole: 'user',
      message: `Dispute escalated to level ${updated.escalationLevel}`,
    });
    await this.messageRepo.save(message);

    this.eventEmitter.emit('dispute.escalated', {
      disputeId: id,
      escalationLevel: updated.escalationLevel,
      assignedTo: dto.assignTo,
    });

    return {
      success: true,
      data: updated,
    };
  }

  async addMessage(disputeId: string, userId: string, senderRole: 'user' | 'admin', dto: DisputeMessageDto) {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const message = this.messageRepo.create({
      disputeId,
      senderId: userId,
      senderRole,
      message: dto.message,
    });

    const saved = await this.messageRepo.save(message);

    return {
      success: true,
      data: saved,
    };
  }

  async resolve(id: string, userId: string) {
    const dispute = await this.disputeRepo.findOne({
      where: { id },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    dispute.status = 'resolved';
    dispute.resolvedAt = new Date();
    const updated = await this.disputeRepo.save(dispute);

    this.eventEmitter.emit('dispute.resolved', { disputeId: id });

    return {
      success: true,
      data: updated,
    };
  }

  async reject(id: string, userId: string) {
    const dispute = await this.disputeRepo.findOne({
      where: { id },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    dispute.status = 'rejected';
    dispute.resolvedAt = new Date();
    const updated = await this.disputeRepo.save(dispute);

    this.eventEmitter.emit('dispute.rejected', { disputeId: id });

    return {
      success: true,
      data: updated,
    };
  }

  async openDispute(dto: OpenDisputeDto): Promise<Dispute> {
    const tx = await this.transactionsService.findById(dto.transactionId);

    if (tx.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException(
        'Disputes can only be opened on completed transactions',
      );
    }

    const dispute = this.disputeV2Repo.create({
      transactionId: dto.transactionId,
      userId: dto.userId,
      reason: dto.reason,
      status: DisputeStatus.OPEN,
      resolution: null,
      resolvedAt: null,
    });

    const saved = await this.disputeV2Repo.save(dispute);
    this.eventEmitter.emit('dispute.opened', {
      disputeId: saved.id,
      userId: dto.userId,
    });
    return saved;
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.findDisputeById(id);

    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.REJECTED
    ) {
      throw new BadRequestException('Dispute is already closed');
    }

    dispute.status = dto.status;
    dispute.resolution = dto.resolution;
    dispute.resolvedAt = new Date();

    const saved = await this.disputeV2Repo.save(dispute);
    this.eventEmitter.emit('dispute.updated', {
      disputeId: saved.id,
      status: saved.status,
    });
    return saved;
  }

  async findDisputeById(id: string): Promise<Dispute> {
    const dispute = await this.disputeV2Repo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);
    return dispute;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoCloseStaleDisputes(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stale = await this.disputeV2Repo.find({
      where: [
        { status: DisputeStatus.OPEN, createdAt: LessThan(cutoff) },
        { status: DisputeStatus.UNDER_REVIEW, createdAt: LessThan(cutoff) },
      ],
    });

    for (const dispute of stale) {
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = 'Auto-closed after 30 days';
      dispute.resolvedAt = new Date();
      await this.disputeV2Repo.save(dispute);
      this.eventEmitter.emit('dispute.auto_closed', {
        disputeId: dispute.id,
        userId: dispute.userId,
      });
      this.logger.log(`Auto-closed dispute ${dispute.id}`);
    }
  }
}
