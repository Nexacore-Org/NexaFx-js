import { ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  AmlDisposition,
  AmlScreening,
  AmlRiskLevel,
} from './aml-screening.entity';
import { AmlScreeningReview } from './aml-screening-review.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { AuditService } from '../audit/audit.service';

const DEFAULT_HIGH_VALUE_THRESHOLD_USD = 10000;
const DEFAULT_CRITICAL_VALUE_THRESHOLD_USD = 50000;

const SANCTIONS_LIST: string[] = [
  'vladimir putin', 'sergei lavrov', 'dmitry peskov',
  'ali hosseinmenehbadi', 'ahmad vahidi', 'mohammad javad zarif',
  'kim jong un', 'choe ryong hae',
  'bashar al-assad', 'asma al-assad',
  'nicolas maduro', 'diosdado cabello',
  'alexander lukashenko', 'viktor sheiman',
  'omar al-bashir', 'ahmed harun',
  'yevgeny prigozhin', 'dmitry utkin',
];

const PEP_LIST: string[] = [
  'minister', 'president', 'senator', 'governor',
  'prime minister', 'chief justice', 'speaker',
  'ambassador', 'secretary', 'chancellor',
  'parliamentarian', 'congressman', 'congresswoman',
  'premier', 'dictator', 'monarch', 'king', 'queen',
  'emir', 'sultan', 'ayatollah', 'general',
];

export interface ScreenUserInput {
  userId: string;
  fullName?: string;
  dateOfBirth?: string;
}

export interface ScreenTransactionInput {
  userId: string;
  transactionId: string;
  amount: number;
  currency: string;
  counterpartyName?: string;
}

export interface ScreeningFilters {
  userId?: string;
  riskLevel?: AmlRiskLevel;
  page?: number;
  limit?: number;
}

export interface ScreeningPage {
  items: AmlScreening[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class AmlScreeningService {
  private readonly logger = new Logger(AmlScreeningService.name);

  constructor(
    @InjectRepository(AmlScreening)
    private readonly repo: Repository<AmlScreening>,
    @InjectRepository(AmlScreeningReview)
    private readonly reviewRepo: Repository<AmlScreeningReview>,
    private readonly config: ConfigService,
    private readonly rates: ExchangeRatesService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async screenUser(input: ScreenUserInput): Promise<AmlScreening> {
    const flags: string[] = [];
    let riskScore = 0;

    if (input.fullName) {
      const lowerName = input.fullName.toLowerCase();
      if (SANCTIONS_LIST.some((s) => lowerName.includes(s))) {
        flags.push('sanctions_match');
        riskScore += 50;
      }
      if (PEP_LIST.some((p) => lowerName.includes(p))) {
        flags.push('pep');
        riskScore += 30;
      }
    }

    const riskLevel = this.calculateRiskLevel(riskScore);

    const screening = this.repo.create({
      userId: input.userId,
      transactionId: null,
      riskScore,
      riskLevel,
      flags,
    });

    return this.repo.save(screening);
  }

  async screenTransaction(input: ScreenTransactionInput): Promise<AmlScreening> {
    const flags: string[] = [];
    let riskScore = 0;

    // Thresholds are configured in USD; compare like with like.
    const amountUsd = await this.toUsd(input.amount, input.currency);
    const highValueThreshold =
      this.config.get<number>('aml.highValueThresholdUsd') ??
      DEFAULT_HIGH_VALUE_THRESHOLD_USD;
    const criticalValueThreshold =
      this.config.get<number>('aml.criticalValueThresholdUsd') ??
      DEFAULT_CRITICAL_VALUE_THRESHOLD_USD;

    if (amountUsd >= criticalValueThreshold) {
      flags.push('high_value');
      riskScore += 60;
    } else if (amountUsd >= highValueThreshold) {
      flags.push('high_value');
      riskScore += 30;
    }

    if (input.counterpartyName) {
      const lowerName = input.counterpartyName.toLowerCase();
      if (SANCTIONS_LIST.some((s) => lowerName.includes(s))) {
        flags.push('sanctions_match');
        riskScore += 50;
      }
    }

    const riskLevel = this.calculateRiskLevel(riskScore);

    const screening = this.repo.create({
      userId: input.userId,
      transactionId: input.transactionId,
      riskScore,
      riskLevel,
      flags,
    });

    return this.repo.save(screening);
  }

  async findAll(filters: ScreeningFilters = {}): Promise<ScreeningPage> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

    const where: Record<string, unknown> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.riskLevel) where.riskLevel = filters.riskLevel;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { screenedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<AmlScreening> {
    const screening = await this.repo.findOne({ where: { id } });
    if (!screening) {
      throw new NotFoundException(`AML screening ${id} not found`);
    }
    return screening;
  }

  async review(
    id: string,
    reviewedBy: string,
    notes: string,
    disposition: AmlDisposition,
  ): Promise<AmlScreening> {
    const screening = await this.findById(id);
    if (screening.disposition) {
      throw new ConflictException('Screening has already been reviewed');
    }

    screening.reviewedBy = reviewedBy;
    screening.reviewedAt = new Date();
    screening.notes = notes;
    screening.disposition = disposition;
    const saved = await this.repo.save(screening);

    await this.reviewRepo.save(
      this.reviewRepo.create({
        screeningId: screening.id,
        reviewedBy,
        disposition,
        notes,
      }),
    );

    await this.audit?.log({
      userId: reviewedBy,
      action: 'aml.screening.reviewed',
      entityType: 'aml_screening',
      entityId: screening.id,
      after: { disposition, notes },
    });

    return saved;
  }

  /** Convert to USD (the threshold currency); a missing rate is a hard error. */
  private async toUsd(amount: number, currency: string): Promise<number> {
    const code = (currency ?? 'USD').toUpperCase();
    if (code === 'USD') return amount;
    const { convertedAmount } = await this.rates.calculateConversion(
      code,
      'USD',
      amount,
    );
    return convertedAmount;
  }

  private calculateRiskLevel(score: number): AmlRiskLevel {
    if (score >= 80) return AmlRiskLevel.CRITICAL;
    if (score >= 50) return AmlRiskLevel.HIGH;
    if (score >= 20) return AmlRiskLevel.MEDIUM;
    return AmlRiskLevel.LOW;
  }
}
