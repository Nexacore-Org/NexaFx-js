import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';
import { withTransaction } from '../common/helpers/with-transaction.helper';

const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface SubmitKycDto {
  userId: string;
  documentType: string;
  documentNumber: string;
  documentUrl: string;
}

export interface ReviewKycDto {
  reviewerId: string;
  status: KycDocumentStatus.APPROVED | KycDocumentStatus.REJECTED;
}

function validateDocumentUrl(url: string, allowedHost: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('documentUrl must be a valid URL');
  }
  if (parsed.hostname !== allowedHost) {
    throw new BadRequestException(
      `documentUrl must originate from the authorised storage domain (${allowedHost})`,
    );
  }
}

@Injectable()
export class KycService {
  private readonly storageHost: string;

  constructor(
    @InjectRepository(KycDocument)
    private readonly kycRepo: Repository<KycDocument>,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.storageHost =
      this.config.get<string>('kyc.storageHost') ??
      (process.env.KYC_STORAGE_HOST || '');
  }

  async submit(dto: SubmitKycDto): Promise<KycDocument> {
    if (this.storageHost) {
      validateDocumentUrl(dto.documentUrl, this.storageHost);
    }

    try {
      return await withTransaction(this.dataSource, async (manager) => {
        const existing = await manager.findOne(KycDocument, {
          where: { userId: dto.userId, status: KycDocumentStatus.PENDING },
        });
        if (existing) {
          throw new ConflictException({
            message: 'An active KYC submission already exists for this user',
            submissionId: existing.id,
          });
        }
        const doc = manager.create(KycDocument, dto);
        return manager.save(KycDocument, doc);
      });
    } catch (err) {
      if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
        const existing = await this.kycRepo.findOne({
          where: { userId: dto.userId, status: KycDocumentStatus.PENDING },
        });
        throw new ConflictException({
          message: 'An active KYC submission already exists for this user',
          submissionId: existing?.id,
        });
      }
      throw err;
    }
  }

  async review(id: string, dto: ReviewKycDto): Promise<KycDocument> {
    const doc = await this.kycRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`KYC document ${id} not found`);
    if (doc.status !== KycDocumentStatus.PENDING) {
      throw new ForbiddenException('Document has already been reviewed');
    }

    doc.status = dto.status;
    doc.reviewedBy = dto.reviewerId;
    doc.reviewedAt = new Date();
    const saved = await this.kycRepo.save(doc);
    this.events.emit('kyc.reviewed', saved);
    return saved;
  }

  async isApproved(userId: string): Promise<boolean> {
    const doc = await this.kycRepo.findOne({
      where: { userId, status: KycDocumentStatus.APPROVED },
    });
    return !!doc;
  }

  async assertApproved(userId: string): Promise<void> {
    const approved = await this.isApproved(userId);
    if (!approved) {
      throw new ForbiddenException(
        'KYC verification required to perform this operation',
      );
    }
  }
}
