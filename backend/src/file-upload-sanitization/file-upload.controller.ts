import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
    Body,
  } from '@nestjs/common';
  import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
  import { ApiTags, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
  import { FileUploadService } from './file-upload.service';
  import { FileValidationPipe } from './pipes/file-validation.pipe';
  import { UploadConfigDto } from './dto/upload-config.dto';
  
  @ApiTags('File Upload')
  @Controller('files')
  export class FileUploadController {
    constructor(private readonly fileUploadService: FileUploadService) {}
  
    @Post('upload/single')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
          },
          allowedTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: Override allowed MIME types',
          },
          maxSize: {
            type: 'number',
            description: 'Optional: Override max file size in bytes',
          },
          enableAntivirus: {
            type: 'boolean',
            description: 'Optional: Enable antivirus scanning',
          },
        },
      },
    })
    @ApiResponse({ status: 200, description: 'File uploaded successfully' })
    @ApiResponse({ status: 400, description: 'Invalid file or validation failed' })
    async uploadSingle(
      @UploadedFile(FileValidationPipe) file: Express.Multer.File,
      @Body() config?: UploadConfigDto,
    ) {
      if (!file) {
        throw new BadRequestException('No file provided');
      }
  
      return await this.fileUploadService.processFile(file, config);
    }
  
    @Post('upload/multiple')
    @UseInterceptors(FilesInterceptor('files', 10))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
      schema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'string',
              format: 'binary',
            },
          },
          allowedTypes: {
            type: 'array',
            items: { type: 'string' },
          },
          maxSize: { type: 'number' },
          enableAntivirus: { type: 'boolean' },
        },
      },
    })
    async uploadMultiple(
      @UploadedFiles(FileValidationPipe) files: Express.Multer.File[],
      @Body() config?: UploadConfigDto,
    ) {
      if (!files || files.length === 0) {
        throw new BadRequestException('No files provided');
      }
  
      const results = await Promise.allSettled(
        files.map(file => this.fileUploadService.processFile(file, config)),
      );
  
      return {
        successful: results
          .filter(result => result.status === 'fulfilled')
          .map(result => (result as PromiseFulfilledResult<any>).value),
        failed: results
          .filter(result => result.status === 'rejected')
          .map((result, index) => ({
            filename: files[index].originalname,
            error: (result as PromiseRejectedResult).reason.message,
          })),
      };
    }
  }
