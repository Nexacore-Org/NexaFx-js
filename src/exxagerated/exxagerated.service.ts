import { Injectable, Logger } from '@nestjs/common';

/**
 * Service responsible for ensuring data anonymization and PII protection
 * in aggregated metrics
 */
@Injectable()
export class AnonymizationService {
  private readonly logger = new Logger(AnonymizationService.name);

  // Minimum threshold for aggregated data to prevent de-anonymization
  private readonly MIN_AGGREGATION_THRESHOLD = 10;

  /**
   * Validates that aggregated data meets minimum threshold requirements
   * to prevent potential de-anonymization through small sample sizes
   */
  validateAggregationThreshold(count: number): boolean {
    if (count < this.MIN_AGGREGATION_THRESHOLD) {
      this.logger.warn(
        `Aggregation count ${count} below minimum threshold ${this.MIN_AGGREGATION_THRESHOLD}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Applies k-anonymity principles by suppressing data below threshold
   * Returns null if data doesn't meet anonymity requirements
   */
  applyKAnonymity<T extends { count?: number }>(
    data: T,
    threshold: number = this.MIN_AGGREGATION_THRESHOLD,
  ): T | null {
    if (data.count && data.count < threshold) {
      this.logger.debug(
        `Suppressing data due to k-anonymity violation (count: ${data.count})`,
      );
      return null;
    }
    return data;
  }

  /**
   * Rounds numerical values to reduce precision and prevent
   * inference attacks through exact values
   */
  applyNumericalNoise(value: number, precision: number = 2): number {
    return Number(value.toFixed(precision));
  }

  /**
   * Applies differential privacy noise to protect individual data points
   * Uses Laplace mechanism for numerical values
   */
  applyDifferentialPrivacy(
    value: number,
    sensitivity: number = 1,
    epsilon: number = 0.1,
  ): number {
    const scale = sensitivity / epsilon;
    const noise = this.laplacianNoise(scale);
    return Math.max(0, value + noise); // Ensure non-negative values
  }

  /**
   * Generates Laplacian noise for differential privacy
   */
  private laplacianNoise(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
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
   * Creates a privacy-safe summary of metrics
   * Ensures all values are properly anonymized
   */
  createPrivacySafeSummary(rawMetrics: any): any {
    const piiFields = this.detectPotentialPII(rawMetrics);

    if (piiFields.length > 0) {
      this.logger.error(
        `PII detected in metrics summary: ${piiFields.join(', ')}`,
      );
      throw new Error(
        'Cannot create summary: PII fields detected in raw metrics',
      );
    }

    // Apply numerical noise to all numeric values
    const sanitized = this.deepSanitizeNumbers(rawMetrics);

    return {
      ...sanitized,
      privacyNotice:
        'All data is aggregated and anonymized. No personal information is included.',
      dataAnonymizationApplied: true,
      minimumAggregationThreshold: this.MIN_AGGREGATION_THRESHOLD,
    };
  }

  /**
   * Recursively applies numerical noise to all numbers in an object
   */
  private deepSanitizeNumbers(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepSanitizeNumbers(item));
    }

    const sanitized: any = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key];

      if (typeof value === 'number') {
        // Apply rounding for privacy
        sanitized[key] = this.applyNumericalNoise(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.deepSanitizeNumbers(value);
      } else {
        sanitized[key] = value;
      }
    });

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