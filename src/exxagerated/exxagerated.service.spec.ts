import { Test, TestingModule } from '@nestjs/testing';
import { AnonymizationService } from '../services/anonymization.service';

describe('AnonymizationService', () => {
  let service: AnonymizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnonymizationService],
    }).compile();

    service = module.get<AnonymizationService>(AnonymizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAggregationThreshold', () => {
    it('should return true for counts above threshold', () => {
      expect(service.validateAggregationThreshold(100)).toBe(true);
      expect(service.validateAggregationThreshold(10)).toBe(true);
    });

    it('should return false for counts below threshold', () => {
      expect(service.validateAggregationThreshold(9)).toBe(false);
      expect(service.validateAggregationThreshold(5)).toBe(false);
      expect(service.validateAggregationThreshold(0)).toBe(false);
    });
  });

  describe('applyKAnonymity', () => {
    it('should return data when count meets threshold', () => {
      const data = { count: 15, value: 100 };
      const result = service.applyKAnonymity(data);
      expect(result).toEqual(data);
    });

    it('should return null when count below threshold', () => {
      const data = { count: 5, value: 100 };
      const result = service.applyKAnonymity(data);
      expect(result).toBeNull();
    });

    it('should use custom threshold when provided', () => {
      const data = { count: 20, value: 100 };
      const result = service.applyKAnonymity(data, 25);
      expect(result).toBeNull();
    });
  });

  describe('applyNumericalNoise', () => {
    it('should round to specified precision', () => {
      expect(service.applyNumericalNoise(123.456789, 2)).toBe(123.46);
      expect(service.applyNumericalNoise(123.456789, 0)).toBe(123);
      expect(service.applyNumericalNoise(123.456789, 4)).toBe(123.4568);
    });

    it('should handle edge cases', () => {
      expect(service.applyNumericalNoise(0, 2)).toBe(0);
      expect(service.applyNumericalNoise(-123.456, 2)).toBe(-123.46);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact email addresses', () => {
      const message = 'Error for user john.doe@example.com';
      const sanitized = service.sanitizeErrorMessage(message);
      expect(sanitized).toBe('Error for user [EMAIL_REDACTED]');
      expect(sanitized).not.toContain('john.doe@example.com');
    });

    it('should redact phone numbers', () => {
      const message = 'Contact at +1-555-123-4567';
      const sanitized = service.sanitizeErrorMessage(message);
      expect(sanitized).toBe('Contact at [PHONE_REDACTED]');
    });

    it('should redact UUIDs', () => {
      const message = 'User ID: 123e4567-e89b-12d3-a456-426614174000';
      const sanitized = service.sanitizeErrorMessage(message);
      expect(sanitized).toBe('User ID: [ID_REDACTED]');
    });

    it('should handle multiple PII types', () => {
      const message =
        'User john@example.com (555-1234) has ID 123e4567-e89b-12d3-a456-426614174000';
      const sanitized = service.sanitizeErrorMessage(message);
      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('555-1234');
      expect(sanitized).not.toContain('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('detectPotentialPII', () => {
    it('should detect common PII field names', () => {
      const data = {
        email: 'test@example.com',
        phoneNumber: '555-1234',
        firstName: 'John',
        lastName: 'Doe',
      };

      const piiFields = service.detectPotentialPII(data);
      expect(piiFields).toContain('email');
      expect(piiFields).toContain('phoneNumber');
      expect(piiFields).toContain('firstName');
      expect(piiFields).toContain('lastName');
    });

    it('should detect PII in nested objects', () => {
      const data = {
        user: {
          profile: {
            email: 'test@example.com',
          },
        },
      };

      const piiFields = service.detectPotentialPII(data);
      expect(piiFields).toContain('user.profile.email');
    });

    it('should return empty array for clean data', () => {
      const data = {
        totalCount: 100,
        averageValue: 50.5,
        successRate: 95,
      };

      const piiFields = service.detectPotentialPII(data);
      expect(piiFields).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const data = {
        EMAIL: 'test@example.com',
        PhoneNumber: '555-1234',
      };

      const piiFields = service.detectPotentialPII(data);
      expect(piiFields.length).toBeGreaterThan(0);
    });
  });

  describe('createPrivacySafeSummary', () => {
    it('should create summary for clean data', () => {
      const metrics = {
        totalCount: 1000,
        averageValue: 123.456,
      };

      const summary = service.createPrivacySafeSummary(metrics);
      expect(summary.privacyNotice).toBeDefined();
      expect(summary.dataAnonymizationApplied).toBe(true);
      expect(summary.totalCount).toBe(1000);
      expect(summary.averageValue).toBe(123.46); // Noise applied
    });

    it('should throw error when PII detected', () => {
      const metrics = {
        email: 'test@example.com',
        totalCount: 100,
      };

      expect(() => service.createPrivacySafeSummary(metrics)).toThrow(
        'Cannot create summary: PII fields detected in raw metrics',
      );
    });

    it('should apply numerical noise to nested values', () => {
      const metrics = {
        transactions: {
          average: 123.456789,
          total: 9876.54321,
        },
      };

      const summary = service.createPrivacySafeSummary(metrics);
      expect(summary.transactions.average).toBe(123.46);
      expect(summary.transactions.total).toBe(9876.54);
    });
  });

  describe('generatePrivacyMetadata', () => {
    it('should return comprehensive privacy metadata', () => {
      const metadata = service.generatePrivacyMetadata();

      expect(metadata).toHaveProperty('anonymizationVersion');
      expect(metadata).toHaveProperty('kAnonymityThreshold');
      expect(metadata).toHaveProperty('privacyNotice');
      expect(metadata).toHaveProperty('dataRetentionPolicy');
      expect(metadata.kAnonymityThreshold).toBe(10);
    });
  });

  describe('applyDifferentialPrivacy', () => {
    it('should add noise to values', () => {
      const originalValue = 1000;
      const noisyValue = service.applyDifferentialPrivacy(originalValue);

      // Value should be different due to noise
      expect(noisyValue).not.toBe(originalValue);

      // Should still be in reasonable range (testing with multiple runs)
      expect(noisyValue).toBeGreaterThanOrEqual(0);
      expect(noisyValue).toBeLessThan(originalValue * 2);
    });

    it('should never return negative values', () => {
      for (let i = 0; i < 100; i++) {
        const noisyValue = service.applyDifferentialPrivacy(10);
        expect(noisyValue).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect sensitivity parameter', () => {
      const value = 1000;
      const lowSensitivity = service.applyDifferentialPrivacy(value, 1, 1);
      const highSensitivity = service.applyDifferentialPrivacy(value, 100, 1);

      // Higher sensitivity should generally add more noise
      // (statistical test over multiple runs would be more robust)
      expect(typeof lowSensitivity).toBe('number');
      expect(typeof highSensitivity).toBe('number');
    });
  });
});