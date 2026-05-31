import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycDocument)
    private readonly kycRepo: Repository<KycDocument>,
    private readonly events: EventEmitter2,
  ) {}

  async submit(dto: SubmitKycDto): Promise<KycDocument> {
    const doc = this.kycRepo.create(dto);
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
