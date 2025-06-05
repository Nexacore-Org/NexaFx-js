import { SetMetadata } from '@nestjs/common';

export const RequireHmac = () => SetMetadata(HMAC_REQUIRED_KEY, true);