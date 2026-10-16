import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KycService } from './kyc.service';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';
import { KycStatus, User } from '../users/user.entity';
import { ReviewKycRequestDto } from './dto/review-kyc.dto';
import { SubmitKycRequestDto } from './dto/submit-kyc.dto';
import { AppealKycRequestDto } from './dto/appeal-kyc.dto';

function dataSourceWith(manager: Record<string, jest.Mock>) {
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager,
  };
  return { createQueryRunner: jest.fn(() => queryRunner) } as any;
}

const config = { get: jest.fn().mockReturnValue('storage.example.com') } as any;
const events = { emit: jest.fn() } as any;

describe('KycService.review (#1358, #1359)', () => {
  const pendingDoc = () => ({ id: 'd1', userId: 'u1', status: KycDocumentStatus.PENDING });

  function build(find: jest.Mock = jest.fn().mockResolvedValue([])) {
    const manager: Record<string, jest.Mock> = {
      findOne: jest.fn().mockResolvedValue(pendingDoc()),
      save: jest.fn(async (_e, v) => v),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn(() => ({ find })),
    };
    const audit = { log: jest.fn() };
    const service = new KycService({} as any, events, config, dataSourceWith(manager), audit as any);
    return { service, manager, audit };
  }

  it('approving a document sets User.kycStatus to approved in the same transaction', async () => {
    const { service, manager } = build();
    await service.review('d1', { reviewerId: 'admin-1', status: KycDocumentStatus.APPROVED });
    expect(manager.update).toHaveBeenCalledWith(User, { id: 'u1' }, { kycStatus: KycStatus.APPROVED });
  });

  it('rejecting sets User.kycStatus to rejected when no valid approval remains', async () => {
    const { service, manager } = build();
    await service.review('d1', { reviewerId: 'admin-1', status: KycDocumentStatus.REJECTED });
    expect(manager.update).toHaveBeenCalledWith(User, { id: 'u1' }, { kycStatus: KycStatus.REJECTED });
  });

  it('a rejection keeps the user approved while another unexpired approval is the latest decision', async () => {
    const find = jest.fn().mockResolvedValue([
      { status: KycDocumentStatus.APPROVED, reviewedAt: new Date() },
    ]);
    const { service, manager } = build(find);
    await service.review('d1', { reviewerId: 'admin-1', status: KycDocumentStatus.REJECTED });
    expect(manager.update).toHaveBeenCalledWith(User, { id: 'u1' }, { kycStatus: KycStatus.APPROVED });
  });

  it('attributes the review to the supplied reviewer and audits before/after', async () => {
    const { service, audit } = build();
    const saved = await service.review('d1', {
      reviewerId: 'admin-7',
      status: KycDocumentStatus.APPROVED,
      reason: 'documents verified',
    });
    expect(saved.reviewedBy).toBe('admin-7');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-7',
        before: { status: KycDocumentStatus.PENDING },
        after: expect.objectContaining({ status: KycDocumentStatus.APPROVED }),
        reason: 'documents verified',
      }),
    );
  });

  it('refuses to review an already decided document', async () => {
    const { service, manager } = build();
    manager.findOne.mockResolvedValue({ id: 'd1', userId: 'u1', status: KycDocumentStatus.APPROVED });
    await expect(
      service.review('d1', { reviewerId: 'admin-1', status: KycDocumentStatus.REJECTED }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('KycService approval checks use the latest decided document (#1359)', () => {
  const doc = (status: KycDocumentStatus, daysAgo: number): Partial<KycDocument> => ({
    status,
    reviewedAt: new Date(Date.now() - daysAgo * 86_400_000),
  });
  const service = (latest: Partial<KycDocument> | null) =>
    new KycService(
      { find: jest.fn().mockResolvedValue(latest ? [latest] : []) } as any,
      events, config, {} as any,
    );

  it('approved when the latest decision is a recent approval', async () => {
    await expect(service(doc(KycDocumentStatus.APPROVED, 10)).isApproved('u1')).resolves.toBe(true);
  });

  it('not approved when the latest decision is a rejection', async () => {
    await expect(service(doc(KycDocumentStatus.REJECTED, 1)).isApproved('u1')).resolves.toBe(false);
  });

  it('not approved once the latest approval is past its validity window', async () => {
    await expect(service(doc(KycDocumentStatus.APPROVED, 400)).isApproved('u1')).resolves.toBe(false);
    await expect(service(doc(KycDocumentStatus.APPROVED, 400)).checkExpiry('u1')).resolves.toMatchObject({
      isExpired: true,
    });
  });

  it('not approved with no decided document', async () => {
    await expect(service(null).isApproved('u1')).resolves.toBe(false);
  });
});

describe('KycService.submit hardening (#1358, #1359)', () => {
  it('treats an APPEALED document as an active submission', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'appealed-doc', status: KycDocumentStatus.APPEALED }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const svc = new KycService({} as any, events, config, dataSourceWith(manager as any));
    await expect(
      svc.submit({ userId: 'u1', documentType: 'passport', documentNumber: 'A123456', documentUrl: 'https://storage.example.com/x' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ submissionId: 'appealed-doc' }) });
  });

  it('fails closed in production when no storage host is configured', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const svc = new KycService({} as any, events, { get: jest.fn().mockReturnValue(undefined) } as any, {} as any);
      await expect(
        svc.submit({ userId: 'u1', documentType: 'passport', documentNumber: 'A123456', documentUrl: 'https://evil.example/x' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe('KYC request DTO validation (#1358)', () => {
  const errorsFor = (cls: any, body: object) => validate(plainToInstance(cls, body) as object);

  it('review accepts only approved/rejected and ignores no reviewer identity', async () => {
    expect(await errorsFor(ReviewKycRequestDto, { status: 'approved' })).toHaveLength(0);
    expect(await errorsFor(ReviewKycRequestDto, { status: 'pending' })).not.toHaveLength(0);
    expect(await errorsFor(ReviewKycRequestDto, { status: 'garbage' })).not.toHaveLength(0);
  });

  it('submit validates document type, number and https url', async () => {
    const ok = { documentType: 'passport', documentNumber: 'A1234567', documentUrl: 'https://storage.example.com/a.pdf' };
    expect(await errorsFor(SubmitKycRequestDto, ok)).toHaveLength(0);
    expect(await errorsFor(SubmitKycRequestDto, { ...ok, documentType: 'selfie' })).not.toHaveLength(0);
    expect(await errorsFor(SubmitKycRequestDto, { ...ok, documentNumber: '' })).not.toHaveLength(0);
    expect(await errorsFor(SubmitKycRequestDto, { ...ok, documentUrl: 'http://internal/doc' })).not.toHaveLength(0);
  });

  it('appeal needs a reason of 10-2000 characters', async () => {
    expect(await errorsFor(AppealKycRequestDto, { reason: 'short' })).not.toHaveLength(0);
    expect(await errorsFor(AppealKycRequestDto, {})).not.toHaveLength(0);
    expect(await errorsFor(AppealKycRequestDto, { reason: 'The document was clearly legible.' })).toHaveLength(0);
  });
});
