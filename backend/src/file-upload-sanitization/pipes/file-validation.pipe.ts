import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(value: Express.Multer.File | Express.Multer.File[]) {
    if (!value) {
      throw new BadRequestException('No file(s) provided');
    }

    if (Array.isArray(value)) {
      // Validate multiple files
      for (const file of value) {
        this.validateSingleFile(file);
      }
    } else {
      // Validate single file
      this.validateSingleFile(value);
    }

    return value;
  }

  private validateSingleFile(file: Express.Multer.File) {
    if (!file.originalname || file.originalname.trim() === '') {
      throw new BadRequestException('File must have a valid name');
    }

    if (file.size === 0) {
      throw new BadRequestException('File cannot be empty');
    }

    // Check for null bytes in filename (security)
    if (file.originalname.includes('\0')) {
      throw new BadRequestException('Invalid filename');
    }
  }
}

// dto/upload-config.dto.ts
import { IsOptional, IsArray, IsNumber, IsBoolean, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UploadConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim());
    }
    return value;
  })
  allowedTypes?: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxSize?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  enableAntivirus?: boolean;
}