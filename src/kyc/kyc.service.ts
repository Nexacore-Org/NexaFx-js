import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, In, Not, Repository } from 'typeorm';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';
import { withTransaction } from '../common/helpers/with-transaction.helper';
import { AuditService } from '../audit/audit.service';
import { KycStatus, User } from '../users/user.entity';
import { EncryptionService } from '../common/encryption/encryption.service';
import { last4, openDocumentNumber, sealDocumentNumber } from './kyc-document-number';
import type { KycDocumentView } from './dto/kyc-document-view.dto';

/** Thrown inside the submit transaction; handled outside it so the audit/flag survive the rollback. */
class DuplicateDocumentNumberError extends ConflictException {
  constructor(readonly otherUserId: string) {
    super('This document number is already registered to another account');
  }
}

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
  reason?: string;
}

/** Statuses that mean a submission is still being worked on. */
const ACTIVE_STATUSES = [KycDocumentStatus.PENDING, KycDocumentStatus.APPEALED];

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
    @Optional() private readonly auditService?: AuditService,
    // Provided by KycModule (EncryptionModule). Optional only so older unit tests that build the
    // service by hand keep working; without it nothing is encrypted.
    @Optional() private readonly encryption?: EncryptionService,
  ) {
    this.storageHost =
      this.config.get<string>('kyc.storageHost') ??
      (process.env.KYC_STORAGE_HOST || '');
  }

  async submit(dto: SubmitKycDto): Promise<KycDocument> {
    if (this.storageHost) {
      validateDocumentUrl(dto.documentUrl, this.storageHost);
    } else if (process.env.NODE_ENV === 'production') {
      // Fail closed: without an allow-listed storage host any URL, including
      // internal ones, could be stored for reviewers to open.
      throw new ServiceUnavailableException('KYC document storage is not configured');
    }

    try {
      return await withTransaction(this.dataSource, async (manager) => {
        const existing = await manager.findOne(KycDocument, {
          where: { userId: dto.userId, status: In(ACTIVE_STATUSES) },
        });
        if (existing) {
          throw new ConflictException({
            message: 'An active KYC submission already exists for this user',
            submissionId: existing.id,
          });
        }
        // Encrypt the document number at rest and keep a keyed hash for duplicate detection.
        let toStore: SubmitKycDto & { documentNumberHash?: string } = dto;
        if (this.encryption) {
          const { stored, hash } = sealDocumentNumber(this.encryption, dto.documentNumber);
          const other = await manager.findOne(KycDocument, {
            where: { documentNumberHash: hash, userId: Not(dto.userId) },
          });
          if (other) throw new DuplicateDocumentNumberError(other.userId);
          toStore = { ...dto, documentNumber: stored, documentNumberHash: hash };
        }
        const doc = manager.create(KycDocument, toStore);
        return manager.save(KycDocument, doc);
      });
    } catch (err) {
      if (err instanceof DuplicateDocumentNumberError) {
        // Flag for review: the transaction has rolled back, so record it here.
        await this.auditService?.log({
          userId: dto.userId,
          action: 'kyc.duplicate_document_number',
          entityType: 'kyc_document',
          after: { otherUserId: err.otherUserId },
        });
        this.events.emit('kyc.duplicate_document_number', { userId: dto.userId, otherUserId: err.otherUserId });
        throw err;
      }
      if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
        const existing = await this.kycRepo.findOne({
          where: { userId: dto.userId, status: In(ACTIVE_STATUSES) },
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
    const { saved, before, userStatus } = await withTransaction(this.dataSource, async (manager) => {
      const doc = await manager.findOne(KycDocument, { where: { id } });
      if (!doc) throw new NotFoundException(`KYC document ${id} not found`);
      if (doc.status !== KycDocumentStatus.PENDING && doc.status !== KycDocumentStatus.APPEALED) {
        throw new ForbiddenException('Document has already been reviewed');
      }

      const previousStatus = doc.status;
      doc.status = dto.status;
      doc.reviewedBy = dto.reviewerId;
      doc.reviewedAt = new Date();
      const savedDoc = await manager.save(KycDocument, doc);

      // Keep User.kycStatus in step with the decision, in the same transaction.
      let nextUserStatus: KycStatus;
      if (dto.status === KycDocumentStatus.APPROVED) {
        nextUserStatus = KycStatus.APPROVED;
      } else {
        // A rejection does not override a still-valid approval from another document.
        const latest = await this.latestDecided(manager.getRepository(KycDocument), doc.userId);
        nextUserStatus =
          latest && latest.status === KycDocumentStatus.APPROVED && this.isUnexpired(latest)
            ? KycStatus.APPROVED
            : KycStatus.REJECTED;
      }
      await manager.update(User, { id: doc.userId }, { kycStatus: nextUserStatus });

      return { saved: savedDoc, before: previousStatus, userStatus: nextUserStatus };
    });

    await this.auditService?.log({
      userId: dto.reviewerId,
      action: 'kyc.reviewed',
      entityType: 'kyc_document',
      entityId: id,
      before: { status: before },
      after: { status: saved.status, userKycStatus: userStatus },
      reason: dto.reason,
    });
    // Ids and the decision only: listeners (webhooks, notifications, cache invalidation) must never
    // receive the document number or URL (issue #1535).
    this.events.emit('kyc.reviewed', {
      id: saved.id,
      userId: saved.userId,
      status: saved.status,
      reviewedBy: saved.reviewedBy,
      reviewedAt: saved.reviewedAt,
    });
    return saved;
  }

  /** API representation of a document: last 4 characters of the number, no URL (issue #1535). */
  toView(doc: KycDocument): KycDocumentView {
    const plain = this.encryption ? openDocumentNumber(this.encryption, doc.documentNumber) : doc.documentNumber;
    return {
      id: doc.id,
      documentType: doc.documentType,
      documentNumberLast4: last4(plain),
      status: doc.status,
      createdAt: doc.createdAt,
      reviewedAt: doc.reviewedAt ?? null,
      appealReason: doc.appealReason ?? null,
    };
  }

  async appeal(
    id: string,
    reason: string,
    userId: string,
  ): Promise<KycDocument> {
    const doc = await this.kycRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`KYC document ${id} not found`);
    if (doc.userId !== userId) {
      throw new ForbiddenException('You can only appeal your own KYC document');
    }
    if (doc.status !== KycDocumentStatus.REJECTED) {
      throw new ForbiddenException('Only rejected documents can be appealed');
    }
    
    doc.status = KycDocumentStatus.APPEALED;
    doc.appealReason = reason;
    return this.kycRepo.save(doc);
  }

  /**
   * The latest decided (approved or rejected) document wins: a newer rejection
   * after an older approval means the user is not approved.
   */
  private async latestDecided(
    repo: Repository<KycDocument>,
    userId: string,
  ): Promise<KycDocument | null> {
    const [latest] = await repo.find({
      where: { userId, status: In([KycDocumentStatus.APPROVED, KycDocumentStatus.REJECTED]) },
      order: { reviewedAt: 'DESC' },
      take: 1,
    });
    return latest ?? null;
  }

  private isUnexpired(doc: KycDocument, validityDays = 365): boolean {
    return !!doc.reviewedAt && Date.now() < doc.reviewedAt.getTime() + validityDays * 86_400_000;
  }

  async isApproved(userId: string, validityDays = 365): Promise<boolean> {
    const doc = await this.latestDecided(this.kycRepo, userId);
    if (!doc || doc.status !== KycDocumentStatus.APPROVED || !doc.reviewedAt) return false;
    return this.isUnexpired(doc, validityDays);
  }

  async checkExpiry(userId: string, validityDays = 365) {
    const doc = await this.latestDecided(this.kycRepo, userId);
    if (!doc || doc.status !== KycDocumentStatus.APPROVED || !doc.reviewedAt) {
      return { isApproved: false, isExpired: false, expiresAt: null };
    }
    const expiresAt = new Date(doc.reviewedAt.getTime() + validityDays * 86_400_000);
    const isExpired = Date.now() >= expiresAt.getTime();
    return {
      isApproved: !isExpired,
      isExpired,
      reviewedAt: doc.reviewedAt,
      expiresAt,
    };
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
