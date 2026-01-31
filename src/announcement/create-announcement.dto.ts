import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDate,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AnnouncementStatus } from '../entities/announcement.entity';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(AnnouncementStatus)
  @IsOptional()
  status?: AnnouncementStatus = AnnouncementStatus.DRAFT;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  publishAt?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  expiresAt?: Date;
}