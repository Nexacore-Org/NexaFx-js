import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AmlAlert } from './aml-alert.entity';

export interface TransactionRecord {
  userId: string;
  amount: number;
  currency: string;
  receiverId?: string;
  executedAt: Date;
}

@Injectable()
export class AmlService {
  constructor(
    @InjectRepository(AmlAlert)
    private readonly alertRepo: Repository<AmlAlert>,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async checkStructuring(
    userId: string,
    recentTxs: TransactionRecord[],
  ): Promise<void> {
    const threshold =
      this.config.get<number>('aml.structuringThreshold') ?? 10000;
    const windowHours =
      this.config.get<number>('aml.structuringWindowHours') ?? 24;
    const minCount = this.config.get<number>('aml.structuringMinCount') ?? 3;
    const riskWeight = this.config.get<number>('aml.riskScoreWeight') ?? 30;

    const cutoff = new Date(Date.now() - windowHours * 3600_000);
    const window = recentTxs.filter(
      (t) => t.userId === userId && t.executedAt >= cutoff && t.amount < threshold,
    );

    const total = window.reduce((s, t) => s + t.amount, 0);
    if (window.length >= minCount && total >= threshold) {
      await this.createAlert(userId, 'structuring', riskWeight, {
        txCount: window.length,
        total,
        threshold,
      });
    }
  }

  async checkSmurfing(
    userId: string,
    recentTxs: TransactionRecord[],
  ): Promise<void> {
    const windowHours =
      this.config.get<number>('aml.smurfingWindowHours') ?? 1;
    const minWallets =
      this.config.get<number>('aml.smurfingMinWallets') ?? 3;
    const variancePct =
      this.config.get<number>('aml.smurfingAmountVariancePct') ?? 5;
    const riskWeight = this.config.get<number>('aml.riskScoreWeight') ?? 30;

    const cutoff = new Date(Date.now() - windowHours * 3600_000);
    const window = recentTxs.filter(
      (t) => t.userId === userId && t.executedAt >= cutoff && t.receiverId,
    );

    if (window.length < minWallets) return;

    const amounts = window.map((t) => t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg));

    const uniqueReceivers = new Set(window.map((t) => t.receiverId)).size;
    if (uniqueReceivers >= minWallets && maxDeviation <= variancePct / 100) {
      await this.createAlert(userId, 'smurfing', riskWeight, {
        uniqueReceivers,
        avgAmount: avg,
        variancePct: maxDeviation * 100,
      });
    }
  }

  async checkVelocityBurst(
    userId: string,
    recentTxs: TransactionRecord[],
  ): Promise<void> {
    const windowHours =
      this.config.get<number>('aml.velocityBurstWindowHours') ?? 1;
    const maxCount =
      this.config.get<number>('aml.velocityBurstMaxCount') ?? 10;
    const riskWeight = this.config.get<number>('aml.riskScoreWeight') ?? 30;

    const cutoff = new Date(Date.now() - windowHours * 3600_000);
    const count = recentTxs.filter(
      (t) => t.userId === userId && t.executedAt >= cutoff,
    ).length;

    if (count > maxCount) {
      await this.createAlert(userId, 'velocity-burst', riskWeight, {
        txCount: count,
        windowHours,
        maxCount,
      });
    }
  }

  private async createAlert(
    userId: string,
    ruleTriggered: string,
    riskScore: number,
    metadata: Record<string, unknown>,
  ): Promise<AmlAlert> {
    const alert = this.alertRepo.create({
      userId,
      ruleTriggered,
      riskScore,
      metadata,
    });
    const saved = await this.alertRepo.save(alert);
    this.events.emit('aml.alert.created', saved);
    return saved;
  }
}
