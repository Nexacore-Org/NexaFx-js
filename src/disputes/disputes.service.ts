import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Dispute, DisputeStatus } from './dispute.entity';
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
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    private readonly transactionsService: TransactionsService,
    private readonly events: EventEmitter2,
  ) {}

  async openDispute(dto: OpenDisputeDto): Promise<Dispute> {
    const tx = await this.transactionsService.findById(dto.transactionId);

    if (tx.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException(
        'Disputes can only be opened on completed transactions',
      );
    }

    const dispute = this.disputeRepo.create({
      transactionId: dto.transactionId,
      userId: dto.userId,
      reason: dto.reason,
      status: DisputeStatus.OPEN,
      resolution: null,
      resolvedAt: null,
    });

    const saved = await this.disputeRepo.save(dispute);
    this.events.emit('dispute.opened', {
      disputeId: saved.id,
      userId: dto.userId,
    });
    return saved;
  }

  async resolveDispute(id: string, dto: ResolveDisputeDto): Promise<Dispute> {
    const dispute = await this.findById(id);

    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.REJECTED
    ) {
      throw new BadRequestException('Dispute is already closed');
    }

    dispute.status = dto.status;
    dispute.resolution = dto.resolution;
    dispute.resolvedAt = new Date();

    const saved = await this.disputeRepo.save(dispute);
    this.events.emit('dispute.updated', {
      disputeId: saved.id,
      status: saved.status,
    });
    return saved;
  }

  async findById(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);
    return dispute;
  }

  /** Auto-close disputes older than 30 days that are still open/under_review */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoCloseStaleDisputes(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stale = await this.disputeRepo.find({
      where: [
        { status: DisputeStatus.OPEN, createdAt: LessThan(cutoff) },
        { status: DisputeStatus.UNDER_REVIEW, createdAt: LessThan(cutoff) },
      ],
    });

    for (const dispute of stale) {
      dispute.status = DisputeStatus.RESOLVED;
      dispute.resolution = 'Auto-closed after 30 days';
      dispute.resolvedAt = new Date();
      await this.disputeRepo.save(dispute);
      this.events.emit('dispute.auto_closed', {
        disputeId: dispute.id,
        userId: dispute.userId,
      });
      this.logger.log(`Auto-closed dispute ${dispute.id}`);
    }
  }
}
