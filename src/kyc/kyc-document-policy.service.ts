import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Document types the platform can accept. */
export const DOCUMENT_TYPES = [
  'passport',
  'national_id',
  'drivers_license',
] as const;

/** Allowed document types per tier when no override is configured. */
export const DEFAULT_TIER_DOCUMENTS: Record<string, string[]> = {
  tier_1: ['passport', 'national_id', 'drivers_license'],
  tier_2: ['passport', 'national_id'],
  tier_3: ['passport'],
};

const LABELS: Record<string, string> = {
  passport: 'a passport',
  national_id: 'a national ID',
  drivers_license: 'a drivers license',
};

/**
 * Validates a submitted document type against the requirements of a KYC tier.
 *
 * Requirements default to {@link DEFAULT_TIER_DOCUMENTS} and may be overridden
 * without a code change via the `KYC_TIER_DOCUMENTS` config value, which holds
 * JSON of the form `{"tier_2":["passport"]}`.
 */
@Injectable()
export class KycDocumentPolicyService {
  constructor(private readonly config: ConfigService) {}

  public allowedFor(tier: string): string[] {
    const raw = this.config.get<string>('KYC_TIER_DOCUMENTS');
    const overrides = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return (
      overrides[tier.toLowerCase()] ??
      DEFAULT_TIER_DOCUMENTS[tier.toLowerCase()] ??
      []
    );
  }

  public validate(documentType: string, tier: string): void {
    const normalised = documentType.toLowerCase();
    const allowed = this.allowedFor(tier);
    if (allowed.length === 0) {
      throw new BadRequestException(`Unknown KYC tier '${tier}'.`);
    }
    if (!allowed.includes(normalised)) {
      const accepted = allowed.map((type) => LABELS[type] ?? type).join(' or ');
      throw new BadRequestException(
        `${tier.toUpperCase()} verification requires ${accepted}. ` +
          `${LABELS[normalised] ?? documentType} is not accepted.`,
      );
    }
  }
}
