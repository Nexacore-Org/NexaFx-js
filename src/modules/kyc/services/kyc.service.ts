import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycDocumentEntity, KycDocType, KycLevel } from '../entities/kyc-document.entity';
import { CountryRuleEntity } from '../entities/country-rule.entity';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycDocumentEntity)
    private readonly kycRepo: Repository<KycDocumentEntity>,
    @InjectRepository(CountryRuleEntity)
    private readonly countryRuleRepo: Repository<CountryRuleEntity>,
  ) {}

  async submit(userId: string, docType: KycDocType, metadata?: Record<string, any>): Promise<KycDocumentEntity> {
    const doc = this.kycRepo.create({ userId, docType, status: 'PENDING', metadata });
    return this.kycRepo.save(doc);
  }

  async getStatus(userId: string): Promise<{ level: KycLevel; documents: KycDocumentEntity[] }> {
    const documents = await this.kycRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const level = this.resolveKycLevel(documents);
    return { level, documents };
  }

  async approve(userId: string, docId: string): Promise<KycDocumentEntity> {
    const doc = await this.getDoc(docId, userId);
    doc.status = 'APPROVED';
    return this.kycRepo.save(doc);
  }

  async reject(userId: string, docId: string, reason: string): Promise<KycDocumentEntity> {
    const doc = await this.getDoc(docId, userId);
    doc.status = 'REJECTED';
    doc.rejectionReason = reason;
    return this.kycRepo.save(doc);
  }

  async getCountryRule(countryCode: string): Promise<CountryRuleEntity | null> {
    return this.countryRuleRepo.findOne({ where: { countryCode: countryCode.toUpperCase() } });
  }

  async upsertCountryRule(data: Partial<CountryRuleEntity>): Promise<CountryRuleEntity> {
    const existing = await this.countryRuleRepo.findOne({ where: { countryCode: data.countryCode } });
    if (existing) {
      Object.assign(existing, data);
      return this.countryRuleRepo.save(existing);
    }
    return this.countryRuleRepo.save(this.countryRuleRepo.create(data));
  }

  private resolveKycLevel(documents: KycDocumentEntity[]): KycLevel {
    const approved = documents.filter((d) => d.status === 'APPROVED');
    if (approved.some((d) => d.kycLevel === 'ADVANCED')) return 'ADVANCED';
    if (approved.some((d) => d.kycLevel === 'BASIC')) return 'BASIC';
    return 'NONE';
  }

  private async getDoc(docId: string, userId: string): Promise<KycDocumentEntity> {
    const doc = await this.kycRepo.findOne({ where: { id: docId, userId } });
    if (!doc) throw new NotFoundException('KYC document not found');
    return doc;
  }
}
