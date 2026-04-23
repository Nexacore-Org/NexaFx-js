import { Injectable, Logger, ForbiddenException } from '@nestjs/common';

/**
 * Service responsible for ensuring data anonymization and PII protection
 * in aggregated metrics
 */
@Injectable()
export class AnonymizationValidatorService {
  private readonly logger = new Logger(AnonymizationValidatorService.name);

  // Minimum threshold for aggregated data to prevent de-anonymization
  private readonly MIN_AGGREGATION_THRESHOLD = 10;

  /**
   * Validates that aggregated data meets minimum threshold requirements
   * to prevent potential de-anonymization through small sample sizes
   */
  validateAggregationThreshold(count: number): void {
    if (count < this.MIN_AGGREGATION_THRESHOLD) {
      this.logger.warn(
        `Aggregation count ${count} below minimum threshold ${this.MIN_AGGREGATION_THRESHOLD}`,
      );
      throw new ForbiddenException(
        `Privacy Violation: Sample size (${count}) below threshold (${this.MIN_AGGREGATION_THRESHOLD}).`
      );
    }
  }

  /**
   * Validates that an array of objects contains no PII fields
   * Returns list of potentially problematic fields
   */
  detectPII(data: any[]): string[] {
    if (!data || data.length === 0) return [];
    
    const forbiddenKeys = ['email', 'phoneNumber', 'name', 'firstName', 'lastName', 'address', 'taxId'];
    const sampleKeys = Object.keys(data[0]);
    
    return sampleKeys.filter(key => forbiddenKeys.includes(key));
  }

  /**
   * Validates that an object contains no PII fields
   * Returns list of potentially problematic fields
   */
  detectPotentialPII(data: any): string[] {
    const piiFields = [
      'email',
      'phone',
      'phoneNumber',
      'ssn',
      'socialSecurityNumber',
      'address',
      'firstName',
      'lastName',
      'name',
      'dateOfBirth',
      'dob',
      'passport',
      'driversLicense',
      'creditCard',
      'bankAccount',
      'userId',
      'username',
      'ipAddress',
      'deviceId',
    ];

    const foundPII: string[] = [];

    const checkObject = (obj: any, prefix: string = '') => {
      if (typeof obj !== 'object' || obj === null) return;

      Object.keys(obj).forEach((key) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const lowerKey = key.toLowerCase();

        // Check if key matches PII field names
        if (piiFields.some((piiField) => lowerKey.includes(piiField.toLowerCase()))) {
          foundPII.push(fullKey);
        }

        // Recursively check nested objects
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          checkObject(obj[key], fullKey);
        }
      });
    };

    checkObject(data);
    return foundPII;
  }

  /**
   * Rounds numerical values to reduce precision and prevent
   * inference attacks through exact values
   */
  applyNumericalNoise(value: number, precision: number = 2): number {
    return Number(value.toFixed(precision));
  }

  /**
   * Sanitizes any potential PII from error messages or logs
   */
  sanitizeErrorMessage(message: string): string {
    // Remove email addresses
    let sanitized = message.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL_REDACTED]',
    );

    // Remove phone numbers (basic pattern)
    sanitized = sanitized.replace(
      /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[PHONE_REDACTED]',
    );

    // Remove potential IDs/tokens (UUID pattern)
    sanitized = sanitized.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '[ID_REDACTED]',
    );

    return sanitized;
  }

  /**
   * Generates privacy compliance metadata
   */
  generatePrivacyMetadata(): {
    anonymizationVersion: string;
    kAnonymityThreshold: number;
    privacyNotice: string;
    dataRetentionPolicy: string;
  } {
    return {
      anonymizationVersion: '1.0.0',
      kAnonymityThreshold: this.MIN_AGGREGATION_THRESHOLD,
      privacyNotice:
        'All metrics are aggregated and anonymized in compliance with privacy regulations. No personally identifiable information (PII) is exposed.',
      dataRetentionPolicy:
        'Aggregated metrics are retained according to defined retention policies and automatically purged after expiration.',
    };
  }
}
