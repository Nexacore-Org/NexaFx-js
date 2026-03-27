import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { SplitPayment, SplitStatus } from './split-payment.entity';
import { SplitContribution } from './split-contribution.entity';

@Injectable()
export class SplitPaymentService {
  constructor(
    @InjectRepository(SplitPayment) private splitRepo: Repository<SplitPayment>,
    @InjectRepository(SplitContribution) private contribRepo: Repository<SplitContribution>,
    private dataSource: DataSource,
  ) {}

  async createSplit(initiatorId: string, totalAmount: number, participants: string[]) {
    const totalPeople = participants.length + 1; // Include initiator
    const baseShare = Math.floor((totalAmount / totalPeople) * 100) / 100;
    const remainder = Number((totalAmount - (baseShare * totalPeople)).toFixed(2));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const split = this.splitRepo.create({
        initiatorId,
        totalAmount,
        expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 48h limit
      });
      const savedSplit = await queryRunner.manager.save(split);

      const contributions = [
        // Initiator takes the base share plus any rounding remainder
        this.contribRepo.create({ 
          splitPayment: savedSplit, 
          participantId: initiatorId, 
          amount: baseShare + remainder, 
          hasPaid: true // Initiator is considered "paid" by default
        }),
        ...participants.map(pId => this.contribRepo.create({ 
          splitPayment: savedSplit, 
          participantId: pId, 
          amount: baseShare 
        }))
      ];

      await queryRunner.manager.save(contributions);
      await queryRunner.commitTransaction();
      return savedSplit;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async processContribution(splitId: string, userId: string) {
    const contribution = await this.contribRepo.findOne({
      where: { splitPayment: { id: splitId }, participantId: userId },
      relations: ['splitPayment'],
    });

    if (!contribution || contribution.hasPaid) throw new BadRequestException('Invalid or completed contribution');
    if (contribution.splitPayment.status !== SplitStatus.PENDING) throw new BadRequestException('Split is no longer active');

    // Atomic Transfer Logic
    return await this.dataSource.transaction(async (manager) => {
      contribution.hasPaid = true;
      contribution.transactionId = `tx_split_${Date.now()}`;
      await manager.save(contribution);

      // Check if this was the last payment
      const remaining = await manager.count(SplitContribution, {
        where: { splitPayment: { id: splitId }, hasPaid: false }
      });

      if (remaining === 0) {
        await manager.update(SplitPayment, splitId, { status: SplitStatus.COMPLETED });
      }

      return { success: true, transactionId: contribution.transactionId };
    });
  }

  async handleExpiry() {
    const expiredSplits = await this.splitRepo.find({
      where: { status: SplitStatus.PENDING, expiryDate: LessThan(new Date()) },
      relations: ['contributions']
    });

    for (const split of expiredSplits) {
      // Logic for reversals: return funds to participants who already paid
      const paidContributions = split.contributions.filter(c => c.hasPaid && c.participantId !== split.initiatorId);
      // ... execute reversal transactions ...
      split.status = SplitStatus.EXPIRED;
      await this.splitRepo.save(split);
    }
  }
}