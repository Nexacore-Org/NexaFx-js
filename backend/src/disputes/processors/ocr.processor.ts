import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evidence } from '../entities/evidence.entity';
import {
  TimelineEntry,
  TimelineEntryType,
} from '../entities/timeline-entry.entity';
import { createWorker } from 'tesseract.js';
import * as sharp from 'sharp';
import * as pdfParse from 'pdf-parse';
import { S3Service } from '../services/s3.service';

@Injectable()
@Processor('ocr')
export class OcrProcessor {
  constructor(
    @InjectRepository(Evidence)
    private evidenceRepository: Repository<Evidence>,
    @InjectRepository(TimelineEntry)
    private timelineRepository: Repository<TimelineEntry>,
    private readonly s3Service: S3Service,
  ) {}

  @Process('process-evidence')
  async handleProcessEvidence(
    job: Job<{
      evidenceId: string;
      s3Key: string;
      mimeType: string;
    }>,
  ) {
    const { evidenceId, s3Key, mimeType } = job.data;

    try {
      const evidence = await this.evidenceRepository.findOne({
        where: { id: evidenceId },
        relations: ['dispute'],
      });

      if (!evidence) {
        throw new Error(`Evidence ${evidenceId} not found`);
      }

      console.log(
        `Processing OCR for evidence ${evidenceId}, type: ${mimeType}`,
      );

      let extractedText = '';
      let confidence = 0;
      let extractedData: any = null;

      if (mimeType.startsWith('image/')) {
        const result = await this.processImageOcr(s3Key, mimeType);
        extractedText = result.text;
        confidence = result.confidence;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        extractedData = result.structuredData;
      } else if (mimeType === 'application/pdf') {
        const result = await this.processPdfOcr(s3Key);
        extractedText = result.text;
        confidence = result.confidence;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        extractedData = result.structuredData;
      } else {
        console.log(`Unsupported file type for OCR: ${mimeType}`);
        return;
      }

      // Update evidence with OCR results
      evidence.ocrText = extractedText;
      evidence.ocrConfidence = confidence;
      evidence.extractedData = extractedData
        ? JSON.stringify(extractedData)
        : '';
      evidence.isProcessed = true;

      await this.evidenceRepository.save(evidence);

      // Create timeline entry
      await this.timelineRepository.save({
        disputeId: evidence.disputeId,
        type: TimelineEntryType.EVIDENCE,
        actorType: 'system',
        payload: {
          evidenceId,
          action: 'ocr_processed',
          confidence,
          textLength: extractedText.length,
        },
      });

      console.log(`OCR processing completed for evidence ${evidenceId}`);
    } catch (error) {
      console.error(`Error processing OCR for evidence ${evidenceId}:`, error);

      // Mark evidence as processed with error
      await this.evidenceRepository.update(evidenceId, {
        isProcessed: true,
        ocrText: null,
        ocrConfidence: 0,
      });

      throw error;
    }
  }

  private async processImageOcr(
    _s3Key: string,
    _mimeType: string,
  ): Promise<{
    text: string;
    confidence: number;
    structuredData: any;
  }> {
    try {
      // Download image from S3
      const imageBuffer = await this.s3Service.downloadFile(_s3Key);

      // Preprocess image for better OCR
      const processedImageBuffer = await sharp(imageBuffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .sharpen()
        .normalize()
        .png()
        .toBuffer();

      // Initialize Tesseract worker with minimal typed surface we use
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const worker: {
        recognize: (
          input: Buffer,
        ) => Promise<{ data: { text: string; confidence: number } }>;
        terminate: () => Promise<void>;
      } = await (createWorker('eng') as any);

      let result: {
        text: string;
        confidence: number;
        structuredData: any;
      };

      try {
        // Perform OCR
        const ocrResult = await worker.recognize(processedImageBuffer);
        const { text, confidence } = ocrResult.data as {
          text: string;
          confidence: number;
        };

        // Extract structured data from text
        const structuredData: Record<string, unknown> | null =
          this.extractStructuredData(text);

        result = {
          text: text.trim(),
          confidence: confidence / 100, // Convert to 0-1 scale
          structuredData,
        };
      } finally {
        // Clean up worker - always terminate regardless of success or failure
        await worker.terminate();
      }

      return result;
    } catch (error) {
      console.error('Error processing image OCR:', error);
      throw error;
    }
  }

  private async processPdfOcr(_s3Key: string): Promise<{
    text: string;
    confidence: number;
    structuredData: any;
  }> {
    try {
      // Download PDF from S3
      const pdfBuffer = await this.s3Service.downloadFile(_s3Key);

      // Extract text from PDF using typed wrapper
      const parsePdf: (buf: Buffer) => Promise<{ text: string }> =
        pdfParse as unknown as (buf: Buffer) => Promise<{ text: string }>;
      const pdfData = await parsePdf(pdfBuffer);

      // For PDFs, we'll use a lower confidence score
      // since we're not doing actual OCR on the PDF content
      const confidence = 0.7;

      // Extract structured data from text
      const structuredData: Record<string, unknown> | null =
        this.extractStructuredData(pdfData.text);

      return {
        text: pdfData.text.trim(),
        confidence,
        structuredData,
      };
    } catch (error) {
      console.error('Error processing PDF OCR:', error);
      throw error;
    }
  }

  private extractStructuredData(text: string): Record<string, unknown> | null {
    const structuredData: Record<string, unknown> = {};

    // Extract amounts (Nigerian Naira)
    const amountRegex = /₦\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
    const amounts: number[] = [];
    let match;
    while ((match = amountRegex.exec(text)) !== null) {
      amounts.push(parseFloat((match as RegExpExecArray)[1].replace(/,/g, '')));
    }
    if (amounts.length > 0) {
      structuredData.amounts = amounts;

      structuredData.largestAmount = Math.max(...amounts);
    }

    // Extract dates
    const dateRegex =
      /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(\d{4}[/-]\d{1,2}[/-]\d{1,2})/g;
    const dates: string[] = [];
    while ((match = dateRegex.exec(text)) !== null) {
      dates.push((match as RegExpExecArray)[0]);
    }
    if (dates.length > 0) {
      structuredData.dates = dates;
    }

    // Extract transaction references
    const refRegex = /(?:ref|reference|txn|transaction)[\s#:]*([A-Z0-9]{8,})/gi;
    const references: string[] = [];
    while ((match = refRegex.exec(text)) !== null) {
      references.push((match as RegExpExecArray)[1]);
    }
    if (references.length > 0) {
      structuredData.references = references;
    }

    // Extract phone numbers (Nigerian format)
    const phoneRegex = /(\+234|234|0)?[789][01]\d{8}/g;
    const phones: string[] = [];
    while ((match = phoneRegex.exec(text)) !== null) {
      phones.push((match as RegExpExecArray)[0]);
    }
    if (phones.length > 0) {
      structuredData.phoneNumbers = phones;
    }

    // Extract account numbers
    const accountRegex = /\b\d{10,16}\b/g;
    const accounts: string[] = [];
    while ((match = accountRegex.exec(text)) !== null) {
      if ((match as RegExpExecArray)[0].length >= 10) {
        // Nigerian account numbers are typically 10 digits
        accounts.push((match as RegExpExecArray)[0]);
      }
    }
    if (accounts.length > 0) {
      structuredData.accountNumbers = accounts;
    }

    // Extract merchant/business names (common patterns)
    const merchantRegex =
      /(?:paid to|merchant|business|store)[\s:]*([A-Za-z\s&]+)/gi;
    const merchants: string[] = [];
    while ((match = merchantRegex.exec(text)) !== null) {
      merchants.push((match as RegExpExecArray)[1].trim());
    }
    if (merchants.length > 0) {
      structuredData.merchants = merchants;
    }

    return Object.keys(structuredData).length > 0 ? structuredData : null;
  }
}
