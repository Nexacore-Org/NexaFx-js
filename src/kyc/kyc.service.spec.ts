import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';

describe('KycService', () => {
  let service: KycService;
  let kycRepo: jest.Mocked<Pick<Repository<KycDocument>, 'create' | 'findOne' | 'save'>>;
  let events: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;

  const pendingDoc: KycDocument = {
    id: 'doc-1',
    userId: 'user-1',
    documentType: 'passport',
    documentNumber: 'AB123',
    documentUrl: 'https://example.com/doc.jpg',
    status: KycDocumentStatus.PENDING,
    reviewedBy: undefined as any,
    reviewedAt: undefined as any,
    createdAt: new Date(),
  };

  beforeEach(() => {
    kycRepo = { create: jest.fn(), findOne: jest.fn(), save: jest.fn() } as any;
    events = { emit: jest.fn() } as any;
    config = { get: jest.fn().mockReturnValue('') } as any;
    service = new KycService(kycRepo as any, events as any, config as any);
  });

  describe('review()', () => {
    it('throws NotFoundException when KYC document not found', async () => {
      kycRepo.findOne.mockResolvedValue(null);
      await expect(
        service.review('missing', { reviewerId: 'admin-1', status: KycDocumentStatus.APPROVED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when document already reviewed', async () => {
      kycRepo.findOne.mockResolvedValue({
        ...pendingDoc,
        status: KycDocumentStatus.APPROVED,
      });
      await expect(
        service.review('doc-1', { reviewerId: 'admin-1', status: KycDocumentStatus.APPROVED }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('approval sets status to APPROVED and emits event', async () => {
      kycRepo.findOne.mockResolvedValue({ ...pendingDoc });
      kycRepo.save.mockImplementation((doc) => Promise.resolve(doc as KycDocument));

      const result = await service.review('doc-1', {
        reviewerId: 'admin-1',
        status: KycDocumentStatus.APPROVED,
      });

      expect(result.status).toBe(KycDocumentStatus.APPROVED);
      expect(result.reviewedBy).toBe('admin-1');
      expect(events.emit).toHaveBeenCalledWith('kyc.reviewed', result);
    });

    it('rejection stores status as REJECTED', async () => {
      kycRepo.findOne.mockResolvedValue({ ...pendingDoc });
      kycRepo.save.mockImplementation((doc) => Promise.resolve(doc as KycDocument));

      const result = await service.review('doc-1', {
        reviewerId: 'admin-1',
        status: KycDocumentStatus.REJECTED,
      });

      expect(result.status).toBe(KycDocumentStatus.REJECTED);
    });
  });

  describe('isApproved()', () => {
    it('returns true when an approved document exists', async () => {
      kycRepo.findOne.mockResolvedValue({ ...pendingDoc, status: KycDocumentStatus.APPROVED });
      await expect(service.isApproved('user-1')).resolves.toBe(true);
    });

    it('returns false when no approved document exists', async () => {
      kycRepo.findOne.mockResolvedValue(null);
      await expect(service.isApproved('user-1')).resolves.toBe(false);
    });
  });
});
