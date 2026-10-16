import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TermsAcceptance } from './terms-acceptance.entity';

export interface AcceptTermsInput {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  version?: string;
}

@Injectable()
export class TermsAcceptanceService {
  constructor(
    @InjectRepository(TermsAcceptance)
    private readonly termsRepository: Repository<TermsAcceptance>,
    private readonly config: ConfigService,
  ) {}

  currentVersion(): string {
    return this.config.get<string>('terms.currentVersion') ?? '1.0';
  }

  /**
   * Record acceptance of a terms version. Idempotent: accepting the same
   * `(userId, version)` again (double click, client retry) returns the
   * existing record instead of failing on the unique index.
   */
  async accept(input: AcceptTermsInput, manager?: EntityManager): Promise<TermsAcceptance> {
    const repo = manager ? manager.getRepository(TermsAcceptance) : this.termsRepository;
    const version = input.version ?? this.currentVersion();

    const existing = await repo.findOne({ where: { userId: input.userId, version } });
    if (existing) return existing;

    const record = repo.create({
      userId: input.userId,
      version,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
    try {
      return await repo.save(record);
    } catch (err) {
      // A concurrent request inserted the same row between the check and the
      // insert; treat the unique violation as success and return that row.
      const code = (err as { code?: string })?.code;
      if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const winner = await repo.findOne({ where: { userId: input.userId, version } });
        if (winner) return winner;
      }
      throw err;
    }
  }

  /** Whether the user has accepted the current terms version. */
  async hasAcceptedCurrent(userId: string): Promise<boolean> {
    const accepted = await this.termsRepository.findOne({
      where: { userId, version: this.currentVersion() },
    });
    return !!accepted;
  }

  /** Acceptance state clients use to decide whether to show the terms prompt. */
  async getStatus(userId: string): Promise<{
    currentVersion: string;
    accepted: boolean;
    acceptedAt: Date | null;
    requiresAction: 'accept_terms' | null;
  }> {
    const version = this.currentVersion();
    const accepted = await this.termsRepository.findOne({ where: { userId, version } });
    return {
      currentVersion: version,
      accepted: !!accepted,
      acceptedAt: accepted?.acceptedAt ?? null,
      requiresAction: accepted ? null : 'accept_terms',
    };
  }

  async ensureAccepted(userId: string): Promise<void> {
    const version = this.currentVersion();
    const accepted = await this.termsRepository.findOne({
      where: { userId, version },
      order: { acceptedAt: 'DESC' },
    });

    if (!accepted) {
      throw new ForbiddenException({
        requiresAction: 'accept_terms',
        version,
      });
    }
  }
}
