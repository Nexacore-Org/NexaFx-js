import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { FileValidationService } from './file-validation.service';
import { AntivirusService } from './antivirus.service';
import { UploadConfigDto } from './dto/upload-config.dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private readonly validationService: FileValidationService,
    private readonly antivirusService: AntivirusService,
  ) {}

  async processFile(
    file: Express.Multer.File,
    config?: UploadConfigDto,
  ): Promise<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
    secure: boolean;
    validations: any;
  }> {
    try {
      // 1. Basic validation
      const validationResult = await this.validationService.validateFile(
        file,
        config,
      );

      if (!validationResult.isValid) {
        throw new BadRequestException(
          `File validation failed: ${validationResult.errors.join(', ')}`,
        );
      }

      // 2. Antivirus scanning (if enabled)
      let antivirusResult = null;
      if (config?.enableAntivirus) {
        antivirusResult = await this.antivirusService.scanFile(file.path);
        if (!antivirusResult.clean) {
          // Clean up the file
          await fs.unlink(file.path).catch(() => {});
          throw new BadRequestException(
            `File rejected by antivirus: ${antivirusResult.threat || 'Unknown threat'}`,
          );
        }
      }

      // 3. Generate secure filename and move file
      const secureFilename = this.generateSecureFilename(file.originalname);
      const finalPath = path.join('./uploads/safe', secureFilename);

      // Ensure directory exists
      await fs.mkdir(path.dirname(finalPath), { recursive: true });

      // Move file to secure location
      await fs.rename(file.path, finalPath);

      this.logger.log(`File processed successfully: ${secureFilename}`);

      return {
        filename: secureFilename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: finalPath,
        secure: true,
        validations: {
          mimeType: validationResult.mimeTypeValid,
          size: validationResult.sizeValid,
          extension: validationResult.extensionValid,
          antivirus: antivirusResult?.clean || null,
        },
      };
    } catch (error) {
      // Clean up file on error
      if (file.path) {
        await fs.unlink(file.path).catch(() => {});
      }
      throw error;
    }
  }

  private generateSecureFilename(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const basename = path.basename(originalName, ext);
    const safeName = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${safeName}_${uuidv4()}${ext}`;
  }
}
