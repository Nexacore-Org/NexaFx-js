import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async accept(input: AcceptTermsInput): Promise<TermsAcceptance> {
    const version = input.version ?? this.currentVersion();
    const record = this.termsRepository.create({
      userId: input.userId,
      version,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
    return this.termsRepository.save(record);
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
