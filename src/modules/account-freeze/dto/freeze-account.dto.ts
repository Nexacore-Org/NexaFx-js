import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class FreezeAccountDto {
  @IsUUID()
  userId: string;

  /** Trimmed first, so a whitespace-only reason is rejected (issue #1524). */
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  reason: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  /** Must be true to freeze an admin account. */
  @IsBoolean()
  @IsOptional()
  confirmAdminFreeze?: boolean;
}
