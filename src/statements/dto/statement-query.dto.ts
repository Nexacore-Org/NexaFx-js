import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsOptional,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SUPPORTED_CURRENCY_CODES } from '../../currencies/supported-currencies';
import { dateDiffInDays } from '../date-diff';

/** Maximum statement range; kept as a constant so service and DTO agree. */
export const MAX_STATEMENT_RANGE_DAYS = 366;

@ValidatorConstraint({ name: 'statementDateRange', async: false })
export class StatementDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as StatementQueryDto;
    if (!dto.from || !dto.to) return false;
    try {
      const days = dateDiffInDays(dto.from, dto.to);
      return days >= 0 && days <= MAX_STATEMENT_RANGE_DAYS;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return `to must be on or after from, and the range must not exceed ${MAX_STATEMENT_RANGE_DAYS} days`;
  }
}

/** Single query contract shared by GET /statements and the documents PDF route. */
@Validate(StatementDateRangeConstraint)
export class StatementQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn([...SUPPORTED_CURRENCY_CODES], {
    message: `currency must be one of ${SUPPORTED_CURRENCY_CODES.join(', ')}`,
  })
  currency!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(['json', 'pdf'])
  format?: 'json' | 'pdf';
}
