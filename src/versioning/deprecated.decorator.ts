import { SetMetadata, applyDecorators } from '@nestjs/common';
import {
  DEPRECATION_METADATA_KEY,
  DEPRECATION_INFO_METADATA_KEY,
  DeprecationInfo,
} from '../constants/api-version.constants';

export interface DeprecatedOptions {
  version: string;
  deprecatedAt: string;
  sunsetDate?: string;
  replacementEndpoint?: string;
  message?: string;
}

/**
 * Marks a controller or route handler as deprecated.
 * Automatically injects deprecation headers into responses.
 */
export const Deprecated = (options: DeprecatedOptions) => {
  const info: DeprecationInfo = { ...options };
  return applyDecorators(
    SetMetadata(DEPRECATION_METADATA_KEY, true),
    SetMetadata(DEPRECATION_INFO_METADATA_KEY, info),
  );
};
