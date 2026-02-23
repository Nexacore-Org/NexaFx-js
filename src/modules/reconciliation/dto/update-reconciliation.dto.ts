import { PartialType } from '@nestjs/mapped-types';
import { CreateReconciliationDto } from './create-reconciliation.dto';

export class UpdateReconciliationDto extends PartialType(CreateReconciliationDto) {}
