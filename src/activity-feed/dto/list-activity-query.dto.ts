import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ActivityType } from '../activity-feed-item.entity';

@ValidatorConstraint({ name: 'activityDateRange', async: false })
export class ActivityDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ListActivityQueryDto;
    if (!dto.startDate || !dto.endDate) return true;
    return new Date(dto.startDate).getTime() <= new Date(dto.endDate).getTime();
  }

  defaultMessage(): string {
    return 'startDate must be on or before endDate';
  }
}

export class ListActivityQueryDto {
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  @Validate(ActivityDateRangeConstraint)
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
