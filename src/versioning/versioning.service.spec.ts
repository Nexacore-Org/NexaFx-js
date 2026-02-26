import { Test, TestingModule } from '@nestjs/testing';
import { VersioningService } from '../../src/versioning/services/versioning.service';
import {
  CURRENT_API_VERSION,
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
  API_VERSIONS,
} from '../../src/versioning/constants/api-version.constants';

describe('VersioningService', () => {
  let service: VersioningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VersioningService],
    }).compile();

    service = module.get<VersioningService>(VersioningService);
  });

  describe('getApiVersionSummary()', () => {
    it('should return current version', () => {
      const summary = service.getApiVersionSummary();
      expect(summary.currentVersion).toBe(CURRENT_API_VERSION);
    });

    it('should include all supported versions', () => {
      const summary = service.getApiVersionSummary();
      expect(summary.supportedVersions).toEqual(
        expect.arrayContaining(SUPPORTED_VERSIONS),
      );
    });

    it('should include deprecated versions', () => {
      const summary = service.getApiVersionSummary();
      expect(summary.deprecatedVersions).toEqual(
        expect.arrayContaining(DEPRECATED_VERSIONS),
      );
    });

    it('should return version info entries for all supported versions', () => {
      const summary = service.getApiVersionSummary();
      expect(summary.versions).toHaveLength(SUPPORTED_VERSIONS.length);
    });

    it('should mark current version as "current" status', () => {
      const summary = service.getApiVersionSummary();
      const currentVersionInfo = summary.versions.find(
        (v) => v.version === CURRENT_API_VERSION,
      );
      expect(currentVersionInfo?.status).toBe('current');
    });

    it('should mark v1 as "deprecated" status', () => {
      const summary = service.getApiVersionSummary();
      const v1Info = summary.versions.find(
        (v) => v.version === API_VERSIONS.V1,
      );
      expect(v1Info?.status).toBe('deprecated');
    });

    it('should attach deprecation info for deprecated versions', () => {
      const summary = service.getApiVersionSummary();
      const v1Info = summary.versions.find(
        (v) => v.version === API_VERSIONS.V1,
      );
      expect(v1Info?.deprecationInfo).toBeDefined();
      expect(v1Info?.deprecationInfo?.deprecatedAt).toBe('2025-01-01');
    });
  });

  describe('isVersionSupported()', () => {
    it('should return true for supported versions', () => {
      expect(service.isVersionSupported('1')).toBe(true);
      expect(service.isVersionSupported('2')).toBe(true);
    });

    it('should return false for unsupported versions', () => {
      expect(service.isVersionSupported('99')).toBe(false);
      expect(service.isVersionSupported('0')).toBe(false);
    });
  });

  describe('isVersionDeprecated()', () => {
    it('should return true for deprecated versions', () => {
      expect(service.isVersionDeprecated('1')).toBe(true);
    });

    it('should return false for non-deprecated versions', () => {
      expect(service.isVersionDeprecated('2')).toBe(false);
    });
  });

  describe('isVersionSunset()', () => {
    it('should return false for versions with future sunset date', () => {
      // v1 has sunset date 2026-01-01, which is in the future
      expect(service.isVersionSunset('1')).toBe(false);
    });

    it('should return false for current version', () => {
      expect(service.isVersionSunset('2')).toBe(false);
    });

    it('should return false for version without sunset date', () => {
      expect(service.isVersionSunset('99')).toBe(false);
    });
  });

  describe('getDeprecationInfo()', () => {
    it('should return deprecation info for v1', () => {
      const info = service.getDeprecationInfo('1');
      expect(info).toBeDefined();
      expect(info?.version).toBe('1');
      expect(info?.sunsetDate).toBe('2026-01-01');
      expect(info?.replacementEndpoint).toBe('/v2/');
    });

    it('should return undefined for non-deprecated versions', () => {
      const info = service.getDeprecationInfo('2');
      expect(info).toBeUndefined();
    });
  });
});
