import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmlScreening, AmlRiskLevel } from './aml-screening.entity';

const HIGH_VALUE_THRESHOLD = 10000;
const CRITICAL_VALUE_THRESHOLD = 50000;

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

    if (input.amount >= CRITICAL_VALUE_THRESHOLD) {
      flags.push('high_value');
      riskScore += 60;
    } else if (input.amount >= HIGH_VALUE_THRESHOLD) {
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
  ): Promise<AmlScreening> {
    const screening = await this.findById(id);
    screening.reviewedBy = reviewedBy;
    screening.reviewedAt = new Date();
    screening.notes = notes;
    return this.repo.save(screening);
  }

  private calculateRiskLevel(score: number): AmlRiskLevel {
    if (score >= 80) return AmlRiskLevel.CRITICAL;
    if (score >= 50) return AmlRiskLevel.HIGH;
    if (score >= 20) return AmlRiskLevel.MEDIUM;
    return AmlRiskLevel.LOW;
  }
}
