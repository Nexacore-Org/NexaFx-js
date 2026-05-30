import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { PdfService } from './pdf.service';

@Module({
  controllers: [DocumentsController],
  providers: [PdfService],
})
export class DocumentsModule {}
