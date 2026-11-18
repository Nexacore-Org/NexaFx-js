import { KycDocumentStatus } from '../kyc-document.entity';

/**
 * What the API returns for a KYC document (issue #1535): never the full document number or the
 * storage URL, only the last four characters of the number.
 */
export interface KycDocumentView {
  id: string;
  documentType: string;
  documentNumberLast4: string;
  status: KycDocumentStatus;
  createdAt: Date;
  reviewedAt?: Date | null;
  appealReason?: string | null;
}
