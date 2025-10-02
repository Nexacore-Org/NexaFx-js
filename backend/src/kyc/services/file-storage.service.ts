import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sharp from 'sharp';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadPath = './uploads/kyc';

  constructor() {
    this.ensureUploadDirectoryExists();
  }

  private async ensureUploadDirectoryExists() {
    try {
      await fs.mkdir(this.uploadPath, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create upload directory', error);
    }
  }

  async uploadFile(userId: string, file: Express.Multer.File): Promise<string> {
    const filename = `${userId}-${Date.now()}-${file.originalname}`;
    const filePath = path.join(this.uploadPath, filename);

    // Image optimization and compression
    await sharp(file.buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(filePath);

    this.logger.log(`File uploaded and optimized: ${filePath}`);
    return filePath; // In production, this would be the S3 URL.
  }
}