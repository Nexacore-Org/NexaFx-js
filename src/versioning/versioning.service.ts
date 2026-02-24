import { Injectable } from '@nestjs/common';
import {
  API_VERSIONS,
  CURRENT_API_VERSION,
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
  VERSION_DEPRECATION_SCHEDULE,
  DeprecationInfo,
} from '../constants/api-version.constants';

export interface VersionInfo {
  version: string;
  status: 'current' | 'supported' | 'deprecated' | 'sunset';
  deprecationInfo?: DeprecationInfo;
}

export interface ApiVersionSummary {
  currentVersion: string;
  supportedVersions: string[];
  deprecatedVersions: string[];
  versions: VersionInfo[];
}

@Injectable()
export class VersioningService {
  getApiVersionSummary(): ApiVersionSummary {
    const versions: VersionInfo[] = SUPPORTED_VERSIONS.map((v) => ({
      version: v,
      status: this.getVersionStatus(v),
      ...(VERSION_DEPRECATION_SCHEDULE[v] && {
        deprecationInfo: VERSION_DEPRECATION_SCHEDULE[v],
      }),
    }));

    return {
      currentVersion: CURRENT_API_VERSION,
      supportedVersions: SUPPORTED_VERSIONS,
      deprecatedVersions: DEPRECATED_VERSIONS,
      versions,
    };
  }

  isVersionSupported(version: string): boolean {
    return SUPPORTED_VERSIONS.includes(version as any);
  }

  isVersionDeprecated(version: string): boolean {
    return DEPRECATED_VERSIONS.includes(version as any);
  }

  isVersionSunset(version: string): boolean {
    const info = VERSION_DEPRECATION_SCHEDULE[version];
    if (!info?.sunsetDate) return false;
    return new Date() > new Date(info.sunsetDate);
  }

  getDeprecationInfo(version: string): DeprecationInfo | undefined {
    return VERSION_DEPRECATION_SCHEDULE[version];
  }

  private getVersionStatus(
    version: string,
  ): 'current' | 'supported' | 'deprecated' | 'sunset' {
    if (this.isVersionSunset(version)) return 'sunset';
    if (version === CURRENT_API_VERSION) return 'current';
    if (this.isVersionDeprecated(version)) return 'deprecated';
    return 'supported';
  }
}
