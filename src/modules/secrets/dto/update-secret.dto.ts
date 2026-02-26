import { PartialType } from '@nestjs/mapped-types';
import { CreateSecretDto } from './create-secret.dto';

export class UpdateSecretDto extends PartialType(CreateSecretDto) {}
