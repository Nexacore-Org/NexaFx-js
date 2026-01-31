import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { AnnouncementStatus } from '../entities/announcement.entity';

export class QueryAnnouncementsDto {
  @IsEnum(AnnouncementStatus)
  @IsOptional()
  status?: AnnouncementStatus;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  activeOnly?: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  includeScheduled?: boolean;
}