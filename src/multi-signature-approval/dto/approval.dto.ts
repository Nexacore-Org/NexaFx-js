import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TransactionStatus } from '../../transactions/transaction.entity';

export enum ApprovalActionType {
  OVERRIDE_TRANSACTION_STATUS = 'override_transaction_status',
  UPDATE_USER_STATUS = 'update_user_status',
}

export class OverrideTransactionStatusData {
  @IsUUID()
  transactionId!: string;

  @IsEnum(TransactionStatus)
  newStatus!: TransactionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateUserStatusData {
  @IsUUID()
  targetUserId!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Request for a second admin to approve a high-risk action; `actionData` is validated per `actionType`. */
export class CreateApprovalDto {
  @IsEnum(ApprovalActionType)
  actionType!: ApprovalActionType;

  @IsObject()
  @ValidateNested()
  @Type(({ object }) =>
    (object as { actionType?: string })?.actionType === ApprovalActionType.UPDATE_USER_STATUS
      ? UpdateUserStatusData
      : OverrideTransactionStatusData,
  )
  actionData!: OverrideTransactionStatusData | UpdateUserStatusData;
}
