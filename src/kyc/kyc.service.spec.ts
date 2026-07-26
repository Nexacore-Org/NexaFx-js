import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { KycService } from './kyc.service';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';

function buildDataSource(manager: Record<string, jest.Mock>) {
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    manager,
  };
  return {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  } as unknown as DataSource;
}

describe('KycService.submit', () => {
  const dto = {
    userId: 'user-1',
    documentType: 'passport',
    documentNumber: 'A1234567',
    documentUrl: 'https://storage.example.com/doc.pdf',
  };
  const config = { get: jest.fn().mockReturnValue('storage.example.com') } as unknown as ConfigService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;

  it('creates a submission when no active one exists', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({ ...dto, id: 'doc-1' }),
      save: jest.fn().mockResolvedValue({ ...dto, id: 'doc-1' }),
    };
    const kycRepo = {} as any;
    const service = new KycService(kycRepo, events, config, buildDataSource(manager));

    const result = await service.submit(dto as any);

    expect(result.id).toBe('doc-1');
    expect(manager.save).toHaveBeenCalled();
  });

  it('returns 409 with the existing submission id when one is already active', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'existing-doc', status: KycDocumentStatus.PENDING }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const kycRepo = {} as any;
    const service = new KycService(kycRepo, events, config, buildDataSource(manager));

    await expect(service.submit(dto as any)).rejects.toMatchObject(
      new ConflictException({
        message: 'An active KYC submission already exists for this user',
        submissionId: 'existing-doc',
      }),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent request wins the DB unique constraint race', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(dto),
      save: jest.fn().mockRejectedValue({ code: '23505' }),
    };
    const kycRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'winner-doc' } as KycDocument),
    } as any;
    const service = new KycService(kycRepo, events, config, buildDataSource(manager));

    await expect(service.submit(dto as any)).rejects.toMatchObject(
      new ConflictException({
        message: 'An active KYC submission already exists for this user',
        submissionId: 'winner-doc',
      }),
    );
  });
});
