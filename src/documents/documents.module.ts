import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [DocumentsController],
  providers: [PdfService, S3Service],
})
export class DocumentsModule {}
