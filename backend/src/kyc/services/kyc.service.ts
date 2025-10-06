import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycSubmission, KycStatus, KycTier } from '../entities/kyc-submission.entity';
import { KycDocument, DocumentType } from '../entities/kyc-document.entity';
import { FileStorageService } from './file-storage.service';
import { VerificationProviderService } from './verification-provider.service';
import { SubmitKycDto } from '../dto/submit-kyc.dto';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycSubmission)
    private readonly submissionRepository: Repository<KycSubmission>,
    @InjectRepository(KycDocument)
    private readonly documentRepository: Repository<KycDocument>,
    private readonly fileStorageService: FileStorageService,
    private readonly verificationProvider: VerificationProviderService,
  ) {}

  async getOrCreateSubmission(userId: string): Promise<KycSubmission> {
      let submission = await this.submissionRepository.findOne({ where: { userId } });
      if (!submission) {
          submission = this.submissionRepository.create({ userId });
          await this.submissionRepository.save(submission);
      }
      return submission;
  }

  async submitKyc(userId: string, submitDto: SubmitKycDto): Promise<KycSubmission> {
    const submission = await this.getOrCreateSubmission(userId);
    
    // Tier 1 Verification (BVN/NIN)
    if(submitDto.bvn) {
        const bvnResult = await this.verificationProvider.verifyBvn(submitDto.bvn, {});
        if(!bvnResult.success) {
            throw new BadRequestException(bvnResult.message);
        }
        submission.bvn = submitDto.bvn;
        submission.tier = KycTier.TIER_1;
    }
    
    submission.status = KycStatus.PENDING; // Set to pending for admin review
    return this.submissionRepository.save(submission);
  }
  
  async uploadDocument(userId: string, type: DocumentType, file: Express.Multer.File): Promise<KycDocument> {
      const submission = await this.getOrCreateSubmission(userId);
      const fileUrl = await this.fileStorageService.uploadFile(userId, file);
      
      const document = this.documentRepository.create({ userId, type, fileUrl });
      await this.documentRepository.save(document);
      
      submission.status = KycStatus.PENDING;
      await this.submissionRepository.save(submission);

      return document;
  }
  
  async getKycStatus(userId: string): Promise<KycSubmission> {
      return this.getOrCreateSubmission(userId);
  }

  // Admin function
  async reviewSubmission(userId: string, approve: boolean, reason?: string): Promise<KycSubmission> {
      const submission = await this.getOrCreateSubmission(userId);
      if(approve) {
          submission.status = KycStatus.VERIFIED;
          submission.rejectionReason = null;
          // Upgrade tier based on documents reviewed
          // For simplicity, let's assume any doc approval gets Tier 2
          submission.tier = Math.max(submission.tier, KycTier.TIER_2) as KycTier;
      } else {
          submission.status = KycStatus.REJECTED;
          submission.rejectionReason = reason;
      }
      return this.submissionRepository.save(submission);
  }
}