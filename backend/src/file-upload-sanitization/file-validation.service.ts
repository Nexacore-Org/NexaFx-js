import { Injectable } from '@nestjs/common';
import { UploadConfigDto } from './dto/upload-config.dto';
import * as fileType from 'file-type';
import * as fs from 'fs/promises';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  mimeTypeValid: boolean;
  sizeValid: boolean;
  extensionValid: boolean;
}

@Injectable()
export class FileValidationService {
  private readonly DEFAULT_ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  private readonly DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

  private readonly DANGEROUS_EXTENSIONS = [
    '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js',
    '.jar', '.app', '.deb', '.pkg', '.dmg', '.msi', '.run', '.dll',
    '.so', '.dylib', '.php', '.asp', '.aspx', '.jsp', '.py', '.rb',
    '.pl', '.sh', '.ps1', '.vba', '.macro'
  ];

  async validateFile(
    file: Express.Multer.File,
    config?: UploadConfigDto,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const allowedTypes = config?.allowedTypes || this.DEFAULT_ALLOWED_TYPES;
    const maxSize = config?.maxSize || this.DEFAULT_MAX_SIZE;

    // 1. Size validation
    const sizeValid = file.size <= maxSize;
    if (!sizeValid) {
      errors.push(`File size ${file.size} exceeds maximum ${maxSize} bytes`);
    }

    // 2. Extension validation
    const extension = this.getFileExtension(file.originalname);
    const extensionValid = !this.DANGEROUS_EXTENSIONS.includes(extension);
    if (!extensionValid) {
      errors.push(`Dangerous file extension: ${extension}`);
    }

    // 3. MIME type validation (declared)
    const declaredMimeValid = allowedTypes.includes(file.mimetype);
    if (!declaredMimeValid) {
      errors.push(`MIME type ${file.mimetype} not allowed`);
    }

    // 4. Magic number validation (actual file content)
    let actualMimeValid = true;
    try {
      const buffer = await fs.readFile(file.path);
      const detectedType = await fileType.fromBuffer(buffer);
      
      if (detectedType) {
        actualMimeValid = allowedTypes.includes(detectedType.mime);
        if (!actualMimeValid) {
          errors.push(`Actual file type ${detectedType.mime} doesn't match allowed types`);
        }
        
        // Check if declared MIME matches detected MIME
        if (file.mimetype !== detectedType.mime) {
          errors.push(`Declared MIME type (${file.mimetype}) doesn't match actual type (${detectedType.mime})`);
        }
      }
    } catch (error) {
      errors.push('Could not analyze file content');
      actualMimeValid = false;
    }

    const mimeTypeValid = declaredMimeValid && actualMimeValid;

    return {
      isValid: errors.length === 0,
      errors,
      mimeTypeValid,
      sizeValid,
      extensionValid,
    };
  }

  private getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }
}