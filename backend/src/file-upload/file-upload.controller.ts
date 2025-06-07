import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Get,
  Param,
  Delete,
} from "@nestjs/common"
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express"
import type { FileUploadService, UploadResult } from "./file-upload.service"
import { ApiTags, ApiConsumes, ApiOperation, ApiResponse } from "@nestjs/swagger"

// Custom file validation pipe
import { type PipeTransform, Injectable, type ArgumentMetadata } from "@nestjs/common"

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly fileUploadService: FileUploadService) {}

  async transform(value: Express.Multer.File, metadata: ArgumentMetadata) {
    if (!value) {
      throw new BadRequestException("No file provided")
    }

    const validation = await this.fileUploadService.validateFile(value)
    if (!validation.isValid) {
      throw new BadRequestException(`File validation failed: ${validation.errors.join(", ")}`)
    }

    return value
  }
}

@ApiTags("File Upload")
@Controller("files")
export class FileUploadController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or validation failed' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ message: string; file: UploadResult }> {
    try {
      const validation = await this.fileUploadService.validateFile(file);
      if (!validation.isValid) {
        throw new BadRequestException(`File validation failed: ${validation.errors.join(', ')}`);
      }

      const result = await this.fileUploadService.processUpload(file);

      return {
        message: 'File uploaded successfully',
        file: result,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('upload/multiple')
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Files uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid files or validation failed' })
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ message: string; files: UploadResult[]; errors?: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const results: UploadResult[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const validation = await this.fileUploadService.validateFile(file);
        if (validation.isValid) {
          const result = await this.fileUploadService.processUpload(file);
          results.push(result);
        } else {
          errors.push(`${file.originalname}: ${validation.errors.join(', ')}`);
        }
      } catch (error) {
        errors.push(`${file.originalname}: ${error.message}`);
      }
    }

    return {
      message: `Processed ${results.length} files successfully`,
      files: results,
      ...(errors.length > 0 && { errors }),
    };
  }

  @Get('info/:filename')
  @ApiOperation({ summary: 'Get file information' })
  @ApiResponse({ status: 200, description: 'File information retrieved' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileInfo(@Param('filename') filename: string) {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = this.fileUploadService.sanitizeFilename(filename);
    const filePath = `./uploads/${sanitizedFilename}`;
    
    const info = await this.fileUploadService.getFileInfo(filePath);
    
    if (!info.exists) {
      throw new BadRequestException('File not found');
    }

    return {
      filename: sanitizedFilename,
      exists: info.exists,
      size: info.stats?.size,
      modified: info.stats?.mtime,
    };
  }

  @Delete(':filename')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Param('filename') filename: string) {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = this.fileUploadService.sanitizeFilename(filename);
    const filePath = `./uploads/${sanitizedFilename}`;
    
    try {
      await this.fileUploadService.deleteFile(filePath);
      return { message: 'File deleted successfully' };
    } catch (error) {
      throw new BadRequestException('Failed to delete file');
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for file upload service" })
  async healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "file-upload",
    }
  }
}
