import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Version } from '@nestjs/common';
import { VERSION_METADATA_KEY } from '../constants/api-version.constants';

/**
 * Convenience decorator combining NestJS Version() with custom metadata tracking.
 */
export const ApiVersion = (...versions: string[]) => {
  return applyDecorators(
    Version(versions),
    SetMetadata(VERSION_METADATA_KEY, versions),
  );
};
