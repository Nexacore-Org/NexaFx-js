import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DisputeEntity } from '../entities/dispute.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { FxConversion } from '../../../fx/entities/fx-conversion.entity';
import { OpenDisputeDto, ResolveDisputeDto } from '../dto/dispute.dto';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(DisputeEntity)
    private readonly disputeRepo: Repository<DisputeEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  private async sendDisputeNotification(dispute: DisputeEntity, action: string) {
    // Notify initiator
    await this.notificationService.send({
      type: 'dispute.status_changed',
      userId: dispute.initiatorUserId,
      payload: {
        disputeId: dispute.id,
        subjectType: dispute.subjectType,
        subjectId: dispute.subjectId,
        status: dispute.status,
        action,
        resolutionNote: dispute.resolutionNote,
      },
    });

    // Notify counterparty if exists
    if (dispute.counterpartyUserId) {
      await this.notificationService.send({
        type: 'dispute.status_changed',
        userId: dispute.counterpartyUserId,
        payload: {
          disputeId: dispute.id,
          subjectType: dispute.subjectType,
          subjectId: dispute.subjectId,
          status: dispute.status,
          action,
          resolutionNote: dispute.resolutionNote,
        },
      });
    }
  }

  async openTransactionDispute(
    transactionId: string,
    userId: string,
    dto: OpenDisputeDto,
  ): Promise<DisputeEntity> {
    const existing = await this.disputeRepo.findOne({
      where: { subjectType: 'TRANSACTION', subjectId: transactionId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException('An open dispute already exists for this transaction');
    }

    let dispute: DisputeEntity;

    await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(TransactionEntity, { where: { id: transactionId } });
      if (!tx) throw new NotFoundException('Transaction not found');

      // Hold the transaction — mark it as disputed in metadata
      await manager.update(TransactionEntity, { id: transactionId }, {
        metadata: { ...(tx.metadata ?? {}), disputed: true, disputedAt: new Date() },
      });

      const autoCloseAt = new Date();
      autoCloseAt.setDate(autoCloseAt.getDate() + 30);

      dispute = manager.create(DisputeEntity, {
        subjectType: 'TRANSACTION',
        subjectId: transactionId,
        initiatorUserId: userId,
        status: 'OPEN',
        reason: dto.reason,
        evidenceFileIds: dto.evidenceFileIds ?? null,
        autoCloseAt,
      });
      dispute = await manager.save(DisputeEntity, dispute);
    });

    // Send notification
    await this.sendDisputeNotification(dispute, 'opened');

    return dispute!;
  }

  async openFxConversionDispute(
    conversionId: string,
    userId: string,
    dto: OpenDisputeDto,
  ): Promise<DisputeEntity> {
    const existing = await this.disputeRepo.findOne({
      where: { subjectType: 'FX_CONVERSION', subjectId: conversionId, status: 'OPEN' },
    });
    if (existing) {
      throw new ConflictException('An open dispute already exists for this conversion');
    }

    let dispute: DisputeEntity;

    await this.dataSource.transaction(async (manager) => {
      const conv = await manager.findOne(FxConversion, { where: { id: conversionId } });
      if (!conv) throw new NotFoundException('FX Conversion not found');

      const autoCloseAt = new Date();
      autoCloseAt.setDate(autoCloseAt.getDate() + 30);

      dispute = manager.create(DisputeEntity, {
        subjectType: 'FX_CONVERSION',
        subjectId: conversionId,
        initiatorUserId: userId,
        status: 'OPEN',
        reason: dto.reason,
        evidenceFileIds: dto.evidenceFileIds ?? null,
        autoCloseAt,
      });
      dispute = await manager.save(DisputeEntity, dispute);
    });

    await this.sendDisputeNotification(dispute!, 'opened');

    return dispute!;
  }

  async getUserDisputes(userId: string): Promise<any[]> {
    const disputes = await this.disputeRepo.find({
      where: { initiatorUserId: userId },
      order: { createdAt: 'DESC' },
    });

    // Enrich with transaction details
    const enriched = await Promise.all(
      disputes.map(async (dispute) => {
        let transaction = null;
        if (dispute.subjectType === 'TRANSACTION') {
          transaction = await this.txRepo.findOne({ where: { id: dispute.subjectId } });
        }
        return {
          ...dispute,
          transaction,
        };
      }),
    );

    return enriched;
  }

  async getDisputeById(id: string, userId: string): Promise<any> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.initiatorUserId !== userId) throw new ForbiddenException();

    let transaction = null;
    if (dispute.subjectType === 'TRANSACTION') {
      transaction = await this.txRepo.findOne({ where: { id: dispute.subjectId } });
    }

    return {
      ...dispute,
      transaction,
    };
  }

  async adminResolveDispute(
    id: string,
    dto: ResolveDisputeDto,
  ): Promise<DisputeEntity> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');

    dispute.status = dto.action;
    dispute.resolutionNote = dto.resolutionNote;
    dispute.resolvedAt = new Date();

    dispute = await this.disputeRepo.save(dispute);

    // Send notification
    await this.sendDisputeNotification(dispute, dto.action.toLowerCase());

    return dispute;
  }

  async adminUpdateStatus(id: string, status: 'UNDER_REVIEW'): Promise<DisputeEntity> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    dispute.status = status;
    dispute = await this.disputeRepo.save(dispute);

    // Send notification
    await this.sendDisputeNotification(dispute, 'under_review');

    return dispute;
  }

  /** Auto-close disputes older than 30 days — runs daily */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoCloseExpiredDisputes(): Promise<void> {
    const now = new Date();
    const expired = await this.disputeRepo
      .createQueryBuilder('d')
      .where('d.status = :status', { status: 'OPEN' })
      .andWhere('d.autoCloseAt <= :now', { now })
      .getMany();

    for (const dispute of expired) {
      dispute.status = 'TIMED_OUT';
      dispute.resolvedAt = now;
      await this.disputeRepo.save(dispute);

      // Send notification
      await this.sendDisputeNotification(dispute, 'timed_out');
    }
  }

  async createEscrowDispute(input: {
    escrowId: string;
    initiatorUserId: string;
    counterpartyUserId?: string | null;
    reason: string;
    metadata?: Record<string, any>;
  }): Promise<DisputeEntity> {
    const existingOpenDispute = await this.disputeRepo.findOne({
      where: { subjectType: 'ESCROW', subjectId: input.escrowId, status: 'OPEN' },
    });
    if (existingOpenDispute) {
      throw new ConflictException('An open dispute already exists for this escrow');
    }

    const autoCloseAt = new Date();
    autoCloseAt.setDate(autoCloseAt.getDate() + 30);

    const dispute = this.disputeRepo.create({
      subjectType: 'ESCROW',
      subjectId: input.escrowId,
      initiatorUserId: input.initiatorUserId,
      counterpartyUserId: input.counterpartyUserId ?? null,
      status: 'OPEN',
      reason: input.reason,
      metadata: input.metadata ?? null,
      autoCloseAt,
    });

    return this.disputeRepo.save(dispute);
  }
}
