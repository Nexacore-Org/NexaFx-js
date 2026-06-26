import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';

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
  ) {
    this.storageHost =
      this.config.get<string>('kyc.storageHost') ??
      (process.env.KYC_STORAGE_HOST || '');
  }

  async submit(dto: SubmitKycDto): Promise<KycDocument> {
    const documentUrl = dto.documentUrl.trim();
    if (!documentUrl) {
      throw new BadRequestException('documentUrl is required');
    }

    if (this.storageHost) {
      validateDocumentUrl(documentUrl, this.storageHost);
    }

    const doc = this.kycRepo.create({
      ...dto,
      documentUrl,
    });
    return this.kycRepo.save(doc);
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
