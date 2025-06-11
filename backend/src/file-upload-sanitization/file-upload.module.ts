import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FileUploadController } from './file-upload.controller';
import { FileUploadService } from './file-upload.service';
import { FileValidationService } from './file-validation.service';
import { AntivirusService } from './antivirus.service';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [FileUploadController],
  providers: [FileUploadService, FileValidationService, AntivirusService],
  exports: [FileUploadService, FileValidationService],
})
export class FileUploadModule {}