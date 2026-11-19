import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** Issue #1519: `GET /admin/search?q=` */
export class AdminSearchQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  q!: string;
}
