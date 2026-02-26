import {
  IsUUID,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryType } from '../entities/ledger-entry.entity';

export class CreateLedgerEntryDto {
  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  debit: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  credit: number;

  @ApiProperty({ enum: EntryType })
  @IsEnum(EntryType)
  entryType: EntryType;

  @ApiProperty()
  @IsString()
  @MaxLength(10)
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateDoubleEntryDto {
  @ApiProperty()
  @IsUUID()
  transactionId: string;

  @ApiProperty({ type: [CreateLedgerEntryDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateLedgerEntryDto)
  entries: CreateLedgerEntryDto[];
}

export class ReconciliationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  endDate?: Date;
}

export class ReconciliationResultDto {
  @ApiProperty()
  isBalanced: boolean;

  @ApiProperty()
  totalDebits: number;

  @ApiProperty()
  totalCredits: number;

  @ApiProperty()
  discrepancy: number;

  @ApiProperty()
  entriesChecked: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  checkedAt: Date;

  @ApiPropertyOptional()
  discrepantTransactions?: string[];
}

export class LedgerBalanceDto {
  @ApiProperty()
  accountId: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  computedBalance: number;

  @ApiProperty()
  storedBalance: number;

  @ApiProperty()
  isConsistent: boolean;

  @ApiProperty()
  lastEntryAt: Date;
}
