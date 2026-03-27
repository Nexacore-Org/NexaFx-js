import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { DeletionCertificate } from '../../../compliance-evidence/entities/deletion-certificate.entity';

@Injectable()
export class GdprService {
  // In production, load this securely via ConfigModule/Vault
  private readonly privateKey: string = process.env.GDPR_SIGNING_KEY || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  constructor(
    @InjectRepository(DeletionCertificate)
    private certRepo: Repository<DeletionCertificate>,
    private dataSource: DataSource,
  ) {}

  async processGdprDeletion(userId: string): Promise<DeletionCertificate> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Hash user ID for the certificate
      const userHash = crypto.createHash('sha256').update(userId).digest('hex');
      const anonymizedLabel = `DELETED_${userHash.substring(0, 8)}`;
      const anonymizedFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'taxId'];

      // 2. Anonymize Core User Entity
      await queryRunner.manager.update('users', { id: userId }, {
        firstName: 'Anonymized',
        lastName: 'Anonymized',
        email: `${userHash}@anonymized.local`,
        phone: null,
        address: null,
        taxId: null,
        isActive: false,
        deletedAt: new Date(),
      });

      // 3. Anonymize Transaction PII (Financials retained for 7 years)
      await queryRunner.manager.update('transactions', { userId: userId }, {
        userNameSnapshot: anonymizedLabel,
        userEmailSnapshot: `${userHash}@anonymized.local`,
        // amount, currency, status, and timestamps remain untouched
      });

      // 4. Generate & Sign Deletion Certificate
      const certPayload = JSON.stringify({
        userHash,
        anonymizedFields,
        timestamp: new Date().toISOString(),
      });

      const sign = crypto.createSign('SHA256');
      sign.update(certPayload);
      sign.end();
      const signature = sign.sign(this.privateKey, 'base64');

      const certificate = this.certRepo.create({
        userHash,
        anonymizedFields,
        signature,
      });

      const savedCert = await queryRunner.manager.save(certificate);
      await queryRunner.commitTransaction();
      
      return savedCert;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('GDPR deletion process failed', err.message);
    } finally {
      await queryRunner.release();
    }
  }
}