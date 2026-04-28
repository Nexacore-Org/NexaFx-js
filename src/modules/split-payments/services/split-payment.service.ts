import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { SplitPayment, SplitStatus } from '../entities/split-payment.entity';
import { SplitContribution } from '../entities/split-contribution.entity';
import { UsersService } from '../../../users/users.service';

@Injectable()
export class SplitPaymentService {
  constructor(
    @InjectRepository(SplitPayment) private splitRepo: Repository<SplitPayment>,
    @InjectRepository(SplitContribution) private contribRepo: Repository<SplitContribution>,
    private dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  async createSplit(initiatorId: string, totalAmount: number, participants: string[]) {
    const totalPeople = participants.length + 1;
    const baseShare = Math.floor((totalAmount / totalPeople) * 100) / 100;
    const remainder = Number((totalAmount - baseShare * totalPeople).toFixed(2));

    return this.dataSource.transaction(async (manager) => {
      const split = manager.create(SplitPayment, {
        initiatorId,
        totalAmount,
        expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      const savedSplit = await manager.save(split);

      const contributions = [
        manager.create(SplitContribution, {
          splitPayment: savedSplit,
          participantId: initiatorId,
          amount: baseShare + remainder,
          hasPaid: true,
        }),
        ...participants.map((pId) =>
          manager.create(SplitContribution, {
            splitPayment: savedSplit,
            participantId: pId,
            amount: baseShare,
          }),
        ),
      ];

      await manager.save(contributions);
      return savedSplit;
    });
  }

  async processContribution(splitId: string, userId: string) {
    const contribution = await this.contribRepo.findOne({
      where: { splitPayment: { id: splitId }, participantId: userId },
      relations: ['splitPayment'],
    });

    if (!contribution || contribution.hasPaid)
      throw new BadRequestException('Invalid or completed contribution');
    if (contribution.splitPayment.status !== SplitStatus.PENDING)
      throw new BadRequestException('Split is no longer active');

    return this.dataSource.transaction(async (manager) => {
      // Perform atomic P2P transfer from contributor to initiator
      await this.performP2PTransferInTransaction(manager, userId, contribution.splitPayment.initiatorId, Number(contribution.amount));
      
      contribution.hasPaid = true;
      contribution.transactionId = `tx_split_${Date.now()}`;
      await manager.save(contribution);

      const remaining = await manager.count(SplitContribution, {
        where: { splitPayment: { id: splitId }, hasPaid: false },
      });

      if (remaining === 0) {
        await manager.update(SplitPayment, splitId, { status: SplitStatus.COMPLETED });
      }

      return { success: true, transactionId: contribution.transactionId };
    });
  }

  /**
   * Atomically process expiry refunds for a single split.
   * All refund records are created in one transaction — all succeed or all fail.
   */
  async processExpiryRefund(splitId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const split = await manager.findOne(SplitPayment, {
        where: { id: splitId },
        relations: ['contributions'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!split || split.status !== SplitStatus.PENDING) return;

      // Only refund non-initiator participants who already paid
      const toRefund = split.contributions.filter(
        (c) => c.hasPaid && c.participantId !== split.initiatorId,
      );

      for (const contrib of toRefund) {
        // Use same idempotency key pattern as original contribution
        const refundTxId = `tx_refund_${contrib.transactionId ?? contrib.id}`;
        contrib.transactionId = refundTxId;
        await manager.save(contrib);
      }

      split.status = SplitStatus.EXPIRED;
      await manager.save(split);
    });
  }

  /**
   * Run expiry check: find all expired PENDING splits and process refunds atomically.
   */
  async handleExpiry(): Promise<void> {
    const expiredSplits = await this.splitRepo.find({
      where: { status: SplitStatus.PENDING, expiryDate: LessThan(new Date()) },
      select: ['id'],
    });

    for (const { id } of expiredSplits) {
      await this.processExpiryRefund(id);
    }
  }

  /**
   * Admin: cancel a split and trigger refunds for paid participants.
   */
  async adminCancel(splitId: string): Promise<SplitPayment> {
    await this.dataSource.transaction(async (manager) => {
      const split = await manager.findOne(SplitPayment, {
        where: { id: splitId },
        relations: ['contributions'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!split) throw new NotFoundException('Split payment not found');
      if (split.status !== SplitStatus.PENDING)
        throw new BadRequestException('Only PENDING splits can be cancelled');

      const toRefund = split.contributions.filter(
        (c) => c.hasPaid && c.participantId !== split.initiatorId,
      );

      for (const contrib of toRefund) {
        contrib.transactionId = `tx_refund_admin_${contrib.id}`;
        await manager.save(contrib);
      }

      split.status = SplitStatus.EXPIRED;
      await manager.save(split);
    });

    return this.splitRepo.findOne({ where: { id: splitId }, relations: ['contributions'] });
  }

  /**
   * Admin: list all splits with optional status filter.
   */
  async adminList(
    status?: SplitStatus,
    page = 1,
    limit = 20,
  ): Promise<{ data: SplitPayment[]; total: number }> {
    const where = status ? { status } : {};
    const [data, total] = await this.splitRepo.findAndCount({
      where,
      relations: ['contributions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /**
   * Analytics: total collected, avg participants, completion rate, expiry rate.
   */
  async getAnalytics(): Promise<{
    totalCollected: number;
    avgParticipants: number;
    completionRate: number;
    expiryRate: number;
  }> {
    const all = await this.splitRepo.find({ relations: ['contributions'] });

    if (all.length === 0) {
      return { totalCollected: 0, avgParticipants: 0, completionRate: 0, expiryRate: 0 };
    }

    let totalCollected = 0;
    let totalParticipants = 0;
    let completed = 0;
    let expired = 0;

    for (const split of all) {
      const paidContribs = split.contributions.filter((c) => c.hasPaid);
      totalCollected += paidContribs.reduce((sum, c) => sum + Number(c.amount), 0);
      totalParticipants += split.contributions.length;
      if (split.status === SplitStatus.COMPLETED) completed++;
      if (split.status === SplitStatus.EXPIRED) expired++;
    }

    const settled = completed + expired;
    return {
      totalCollected,
      avgParticipants: totalParticipants / all.length,
      completionRate: settled > 0 ? completed / settled : 0,
      expiryRate: settled > 0 ? expired / settled : 0,
    };
  }

  private async performP2PTransferInTransaction(manager: any, fromUserId: string, toUserId: string, amount: number): Promise<void> {
    // For now, assume USD currency for P2P transfers - can be extended to support multiple currencies
    const currency = 'USD';
    
    // Get and lock sender
    const sender = await manager.findOne('User', { 
      where: { id: fromUserId },
      lock: { mode: 'pessimistic_write' }
    });
    
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }
    
    const senderBalance = Number(sender.balances?.[currency] ?? 0);
    if (senderBalance < amount) {
      throw new BadRequestException('Insufficient balance for P2P transfer');
    }
    
    // Get and lock receiver
    const receiver = await manager.findOne('User', { 
      where: { id: toUserId },
      lock: { mode: 'pessimistic_write' }
    });
    
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }
    
    // Update sender balance (debit)
    const senderBalances = { ...(sender.balances ?? {}) };
    senderBalances[currency] = Number((senderBalance - amount).toFixed(8));
    await manager.update('User', { id: fromUserId }, { balances: senderBalances });
    
    // Update receiver balance (credit)
    const receiverBalance = Number(receiver.balances?.[currency] ?? 0);
    const receiverBalances = { ...(receiver.balances ?? {}) };
    receiverBalances[currency] = Number((receiverBalance + amount).toFixed(8));
    await manager.update('User', { id: toUserId }, { balances: receiverBalances });
  }
}
