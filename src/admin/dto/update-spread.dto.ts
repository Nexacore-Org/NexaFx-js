import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';

/** Issue #1520: replaces the raw `@Body('pair')` / `@Body('spreadPercentage')` fields. */
export class UpdateSpreadDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3,5}\/[A-Z]{3,5}$/, { message: 'pair must look like USD/NGN' })
  pair!: string;

  /** Fraction applied to the customer rate, e.g. 0.005 = 0.5%. Never negative, capped at 20%. */
  @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(0.2)
  spreadPercentage!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
