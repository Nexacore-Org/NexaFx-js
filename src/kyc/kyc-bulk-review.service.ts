import { BadRequestException, Injectable } from '@nestjs/common';
import { KycDocumentStatus } from './kyc-document.entity';
import { KycService } from './kyc.service';

/** Maximum number of KYC records accepted in a single bulk request. */
export const MAX_BULK_REVIEW_IDS = 50;

export interface BulkReviewDto {
  kycIds: string[];
  decision: KycDocumentStatus.APPROVED | KycDocumentStatus.REJECTED;
  reviewerId: string;
}

export interface BulkReviewResult {
  processed: number;
  succeeded: number;
  failed: { id: string; error: string }[];
}

/**
 * Applies one review decision across many KYC records.
 *
 * Each record is reviewed through {@link KycService.review} so existing
 * validation and audit logging apply per record. A failure on one record
 * does not abort the rest of the batch.
 */
@Injectable()
export class KycBulkReviewService {
  constructor(private readonly kycService: KycService) {}

  public async bulkReview(dto: BulkReviewDto): Promise<BulkReviewResult> {
    const ids = Array.from(new Set(dto.kycIds));
    if (ids.length === 0) {
      throw new BadRequestException('kycIds must contain at least one id.');
    }
    if (ids.length > MAX_BULK_REVIEW_IDS) {
      throw new BadRequestException(
        `A bulk review accepts at most ${MAX_BULK_REVIEW_IDS} ids; received ${ids.length}.`,
      );
    }

    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.kycService.review(id, {
          reviewerId: dto.reviewerId,
          status: dto.decision,
        });
      } catch (error) {
        failed.push({ id, error: (error as Error).message });
      }
    }

    return {
      processed: ids.length,
      succeeded: ids.length - failed.length,
      failed,
    };
  }
}
