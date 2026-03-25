import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationService } from '../../notifications/services/notification.service';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { EscrowEntity } from '../entities/escrow.entity';
import { CreateEscrowDto } from '../dto/create-escrow.dto';
import { DisputeEntity } from '../../disputes/entities/dispute.entity';

type EscrowActionResult = {
  escrow: EscrowEntity;
  notifyType: string;
  notifyPayload: Record<string, any>;
};

@Injectable()
export class EscrowService {
  private autoReleaseJob?: {
    schedule(escrowId: string, autoReleaseAt: Date): Promise<void>;
    cancel(escrowId: string): void;
  };

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    @InjectRepository(EscrowEntity)
    private readonly escrowRepository: Repository<EscrowEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(DisputeEntity)
    private readonly disputeRepository: Repository<DisputeEntity>,
  ) {}

  registerAutoReleaseJob(job: {
    schedule(escrowId: string, autoReleaseAt: Date): Promise<void>;
    cancel(escrowId: string): void;
  }): void {
    this.autoReleaseJob = job;
  }

  async createEscrow(senderUserId: string, dto: CreateEscrowDto): Promise<EscrowEntity> {
    const autoReleaseAt = dto.autoReleaseAt ? new Date(dto.autoReleaseAt) : null;
    if (autoReleaseAt && autoReleaseAt.getTime() <= Date.now()) {
      throw new BadRequestException('autoReleaseAt must be in the future');
    }

    const escrow = await this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(WalletEntity);
      const txRepo = manager.getRepository(TransactionEntity);
      const escrowRepo = manager.getRepository(EscrowEntity);

      const senderWallet = await walletRepo.findOne({
        where: { id: dto.senderWalletId, userId: senderUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!senderWallet) {
        throw new NotFoundException('Sender wallet not found');
      }

      const beneficiaryWallet = await walletRepo.findOne({
        where: { id: dto.beneficiaryWalletId, userId: dto.beneficiaryUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!beneficiaryWallet) {
        throw new NotFoundException('Beneficiary wallet not found');
      }

      if (senderWallet.id === beneficiaryWallet.id) {
        throw new BadRequestException('Sender and beneficiary wallets must be different');
      }

      const senderAvailableBalance = this.toAmountNumber(senderWallet.availableBalance);
      if (senderAvailableBalance < dto.amount) {
        throw new ConflictException('Insufficient wallet balance for escrow lock');
      }

      senderWallet.availableBalance = this.normalizeAmount(senderAvailableBalance - dto.amount);
      senderWallet.escrowBalance = this.normalizeAmount(
        this.toAmountNumber(senderWallet.escrowBalance) + dto.amount,
      );
      await walletRepo.save(senderWallet);

      const lockTransaction = await txRepo.save(
        txRepo.create({
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          status: 'SUCCESS',
          walletId: senderWallet.id,
          fromAddress: senderWallet.publicKey,
          toAddress: beneficiaryWallet.publicKey,
          description: 'Escrow funds locked',
          metadata: {
            type: 'ESCROW_LOCK',
            senderUserId,
            beneficiaryUserId: dto.beneficiaryUserId,
            releaseParty: dto.releaseParty,
            autoReleaseAt: autoReleaseAt?.toISOString() ?? null,
          },
        }),
      );

      return escrowRepo.save(
        escrowRepo.create({
          senderUserId,
          senderWalletId: senderWallet.id,
          beneficiaryUserId: dto.beneficiaryUserId,
          beneficiaryWalletId: beneficiaryWallet.id,
          amount: this.normalizeAmount(dto.amount),
          currency: dto.currency.toUpperCase(),
          status: 'PENDING_RELEASE',
          releaseParty: dto.releaseParty,
          autoReleaseAt,
          releaseCondition: dto.releaseCondition ?? null,
          metadata: dto.metadata ?? null,
          lockTransactionId: lockTransaction.id,
        }),
      );
    });

    await this.scheduleIfNeeded(escrow);
    await this.notifyParties('ESCROW_CREATED', escrow, {
      autoReleaseAt: escrow.autoReleaseAt?.toISOString() ?? null,
      releaseCondition: escrow.releaseCondition,
    });

    return this.findById(escrow.id);
  }

  async releaseEscrow(escrowId: string, actorUserId: string, note?: string): Promise<EscrowEntity> {
    const result = await this.applySettlement(escrowId, actorUserId, 'RELEASED', note);
    await this.afterStateChange(result);
    return this.findById(result.escrow.id);
  }

  async cancelEscrow(escrowId: string, actorUserId: string, reason?: string): Promise<EscrowEntity> {
    const result = await this.dataSource.transaction(async (manager) => {
      const escrowRepo = manager.getRepository(EscrowEntity);
      const walletRepo = manager.getRepository(WalletEntity);
      const txRepo = manager.getRepository(TransactionEntity);

      const escrow = await escrowRepo.findOne({
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!escrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (escrow.status !== 'PENDING_RELEASE') {
        throw new ConflictException('Only pending escrows can be cancelled');
      }
      if (escrow.senderUserId !== actorUserId) {
        throw new ConflictException('Only the sender can cancel this escrow');
      }

      const senderWallet = await walletRepo.findOne({
        where: { id: escrow.senderWalletId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!senderWallet) {
        throw new NotFoundException('Sender wallet not found');
      }

      senderWallet.escrowBalance = this.normalizeAmount(
        this.toAmountNumber(senderWallet.escrowBalance) - this.toAmountNumber(escrow.amount),
      );
      senderWallet.availableBalance = this.normalizeAmount(
        this.toAmountNumber(senderWallet.availableBalance) + this.toAmountNumber(escrow.amount),
      );
      await walletRepo.save(senderWallet);

      const cancellationTransaction = await txRepo.save(
        txRepo.create({
          amount: escrow.amount,
          currency: escrow.currency,
          status: 'SUCCESS',
          walletId: senderWallet.id,
          fromAddress: senderWallet.publicKey,
          toAddress: senderWallet.publicKey,
          description: 'Escrow cancelled and reversed to sender',
          metadata: {
            type: 'ESCROW_CANCELLATION',
            escrowId: escrow.id,
            reason: reason ?? null,
            reversedByUserId: actorUserId,
          },
        }),
      );

      escrow.status = 'CANCELLED';
      escrow.cancelledAt = new Date();
      escrow.cancellationTransactionId = cancellationTransaction.id;
      const savedEscrow = await escrowRepo.save(escrow);

      return {
        escrow: savedEscrow,
        notifyType: 'ESCROW_CANCELLED',
        notifyPayload: {
          reason: reason ?? null,
          cancelledByUserId: actorUserId,
        },
      };
    });

    await this.afterStateChange(result);
    return this.findById(result.escrow.id);
  }

  async disputeEscrow(
    escrowId: string,
    actorUserId: string,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<EscrowEntity> {
    const updatedEscrow = await this.dataSource.transaction(async (manager) => {
      const escrowRepo = manager.getRepository(EscrowEntity);
      const disputeRepo = manager.getRepository(DisputeEntity);
      const lockedEscrow = await escrowRepo.findOne({
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedEscrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (lockedEscrow.status !== 'PENDING_RELEASE') {
        throw new ConflictException('Escrow is no longer eligible for dispute');
      }
      if (![lockedEscrow.senderUserId, lockedEscrow.beneficiaryUserId].includes(actorUserId)) {
        throw new ConflictException('Only escrow participants can open a dispute');
      }

      const existingOpenDispute = await disputeRepo.findOne({
        where: {
          subjectType: 'ESCROW',
          subjectId: escrowId,
          status: 'OPEN',
        },
      });
      if (existingOpenDispute) {
        throw new ConflictException('An open dispute already exists for this escrow');
      }

      const dispute = await disputeRepo.save(
        disputeRepo.create({
          subjectType: 'ESCROW',
          subjectId: escrowId,
          initiatorUserId: actorUserId,
          counterpartyUserId:
            actorUserId === lockedEscrow.senderUserId
              ? lockedEscrow.beneficiaryUserId
              : lockedEscrow.senderUserId,
          status: 'OPEN',
          reason,
          metadata: metadata ?? null,
        }),
      );

      lockedEscrow.status = 'DISPUTED';
      lockedEscrow.disputeId = dispute.id;
      lockedEscrow.disputedAt = new Date();

      return escrowRepo.save(lockedEscrow);
    });

    this.autoReleaseJob?.cancel(updatedEscrow.id);
    await this.notifyParties('ESCROW_DISPUTED', updatedEscrow, {
      disputeId: updatedEscrow.disputeId,
      reason,
      initiatedByUserId: actorUserId,
    });

    return this.findById(updatedEscrow.id);
  }

  async processAutoRelease(escrowId: string): Promise<EscrowEntity> {
    const result = await this.applySettlement(escrowId, null, 'AUTO_RELEASED');
    await this.afterStateChange(result);
    return this.findById(result.escrow.id);
  }

  async findById(escrowId: string): Promise<EscrowEntity> {
    const escrow = await this.escrowRepository.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }

    return escrow;
  }

  async findSchedulableEscrows(): Promise<EscrowEntity[]> {
    return this.escrowRepository.find({
      where: {
        status: 'PENDING_RELEASE',
      },
    }).then((escrows) =>
      escrows.filter((escrow) => !!escrow.autoReleaseAt),
    );
  }

  private async applySettlement(
    escrowId: string,
    actorUserId: string | null,
    settlementStatus: 'RELEASED' | 'AUTO_RELEASED',
    note?: string,
  ): Promise<EscrowActionResult> {
    return this.dataSource.transaction(async (manager) => {
      const escrowRepo = manager.getRepository(EscrowEntity);
      const walletRepo = manager.getRepository(WalletEntity);
      const txRepo = manager.getRepository(TransactionEntity);

      const escrow = await escrowRepo.findOne({
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!escrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (escrow.status === 'DISPUTED') {
        throw new ConflictException('Disputed escrows cannot be released');
      }
      if (escrow.status !== 'PENDING_RELEASE') {
        throw new ConflictException('Escrow is not pending release');
      }

      if (settlementStatus === 'AUTO_RELEASED') {
        if (!escrow.autoReleaseAt || escrow.autoReleaseAt.getTime() > Date.now()) {
          throw new ConflictException('Escrow is not yet eligible for auto-release');
        }
      } else {
        this.assertReleaseAuthorization(escrow, actorUserId);
      }

      const senderWallet = await walletRepo.findOne({
        where: { id: escrow.senderWalletId },
        lock: { mode: 'pessimistic_write' },
      });
      const beneficiaryWallet = await walletRepo.findOne({
        where: { id: escrow.beneficiaryWalletId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!senderWallet || !beneficiaryWallet) {
        throw new NotFoundException('Escrow wallet not found');
      }

      senderWallet.escrowBalance = this.normalizeAmount(
        this.toAmountNumber(senderWallet.escrowBalance) - this.toAmountNumber(escrow.amount),
      );
      beneficiaryWallet.availableBalance = this.normalizeAmount(
        this.toAmountNumber(beneficiaryWallet.availableBalance) + this.toAmountNumber(escrow.amount),
      );
      await walletRepo.save([senderWallet, beneficiaryWallet]);

      const releaseTransaction = await txRepo.save(
        txRepo.create({
          amount: escrow.amount,
          currency: escrow.currency,
          status: 'SUCCESS',
          walletId: beneficiaryWallet.id,
          fromAddress: senderWallet.publicKey,
          toAddress: beneficiaryWallet.publicKey,
          description:
            settlementStatus === 'AUTO_RELEASED'
              ? 'Escrow auto-released to beneficiary'
              : 'Escrow manually released to beneficiary',
          metadata: {
            type: settlementStatus === 'AUTO_RELEASED' ? 'ESCROW_AUTO_RELEASE' : 'ESCROW_RELEASE',
            escrowId: escrow.id,
            note: note ?? null,
            releasedByUserId: actorUserId,
          },
        }),
      );

      escrow.status = settlementStatus;
      escrow.releasedAt = new Date();
      escrow.releasedByUserId = actorUserId;
      escrow.releaseTransactionId = releaseTransaction.id;
      const savedEscrow = await escrowRepo.save(escrow);

      return {
        escrow: savedEscrow,
        notifyType: settlementStatus === 'AUTO_RELEASED' ? 'ESCROW_AUTO_RELEASED' : 'ESCROW_RELEASED',
        notifyPayload: {
          note: note ?? null,
          releasedByUserId: actorUserId,
          releaseTransactionId: releaseTransaction.id,
        },
      };
    });
  }

  private assertReleaseAuthorization(escrow: EscrowEntity, actorUserId: string | null): void {
    if (!actorUserId) {
      throw new ConflictException('Release actor is required');
    }

    const authorizedUserId =
      escrow.releaseParty === 'SENDER' ? escrow.senderUserId : escrow.beneficiaryUserId;
    if (authorizedUserId !== actorUserId) {
      throw new ConflictException('Actor is not authorized to release this escrow');
    }
  }

  private async afterStateChange(result: EscrowActionResult): Promise<void> {
    this.autoReleaseJob?.cancel(result.escrow.id);
    await this.notifyParties(result.notifyType, result.escrow, result.notifyPayload);
  }

  private async scheduleIfNeeded(escrow: EscrowEntity): Promise<void> {
    if (!escrow.autoReleaseAt || escrow.status !== 'PENDING_RELEASE') {
      return;
    }

    await this.autoReleaseJob?.schedule(escrow.id, escrow.autoReleaseAt);
  }

  private async notifyParties(
    type: string,
    escrow: EscrowEntity,
    eventPayload: Record<string, any>,
  ): Promise<void> {
    const basePayload = {
      escrowId: escrow.id,
      amount: escrow.amount,
      currency: escrow.currency,
      status: escrow.status,
      senderWalletId: escrow.senderWalletId,
      beneficiaryWalletId: escrow.beneficiaryWalletId,
      ...eventPayload,
    };

    await Promise.all([
      this.notificationService.send({
        type,
        userId: escrow.senderUserId,
        payload: { ...basePayload, role: 'sender' },
      }),
      this.notificationService.send({
        type,
        userId: escrow.beneficiaryUserId,
        payload: { ...basePayload, role: 'beneficiary' },
      }),
    ]);
  }

  private toAmountNumber(value: number | string | null | undefined): number {
    return Number.parseFloat((value ?? 0).toString());
  }

  private normalizeAmount(value: number): number {
    return Number.parseFloat(value.toFixed(8));
  }
}
