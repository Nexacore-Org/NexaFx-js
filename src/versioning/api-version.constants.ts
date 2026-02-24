export const API_VERSIONS = {
  V1: '1',
  V2: '2',
} as const;

export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

export const CURRENT_API_VERSION: ApiVersion = API_VERSIONS.V2;
export const SUPPORTED_VERSIONS: ApiVersion[] = [API_VERSIONS.V1, API_VERSIONS.V2];
export const DEPRECATED_VERSIONS: ApiVersion[] = [API_VERSIONS.V1];

export const API_VERSION_HEADER = 'X-API-Version';
export const API_DEPRECATED_HEADER = 'X-API-Deprecated';
export const API_DEPRECATION_DATE_HEADER = 'X-API-Deprecation-Date';
export const API_SUNSET_DATE_HEADER = 'Sunset';
export const API_DEPRECATION_INFO_HEADER = 'Deprecation';
export const LINK_HEADER = 'Link';

export const DEPRECATION_METADATA_KEY = 'api:deprecated';
export const VERSION_METADATA_KEY = 'api:version';
export const DEPRECATION_INFO_METADATA_KEY = 'api:deprecation:info';

export interface DeprecationInfo {
  version: string;
  deprecatedAt: string;
  sunsetDate?: string;
  replacementEndpoint?: string;
  message?: string;
}

export const VERSION_DEPRECATION_SCHEDULE: Record<string, DeprecationInfo> = {
  [API_VERSIONS.V1]: {
    version: API_VERSIONS.V1,
    deprecatedAt: '2025-01-01',
    sunsetDate: '2026-01-01',
    replacementEndpoint: '/v2/',
    message: 'API v1 is deprecated. Please migrate to v2.',
  },
};
