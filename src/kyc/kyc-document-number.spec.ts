import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncryptionService } from '../common/encryption/encryption.service';
import { KycService } from './kyc.service';
import { KycDocument, KycDocumentStatus } from './kyc-document.entity';
import { isSealed, normaliseDocumentNumber, openDocumentNumber, sealDocumentNumber } from './kyc-document-number';

/** Issue #1535 */
const KEY = '11'.repeat(32);

function encryption() {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith('WALLET_ENCRYPTION_KEY') || k === 'KYC_DOCUMENT_HASH_KEY') delete process.env[k];
  process.env.WALLET_ENCRYPTION_KEY = KEY;
  const svc = new EncryptionService({ get: jest.fn().mockReturnValue(KEY) } as any);
  process.env = saved;
  return svc;
}

describe('document number sealing (issue #1535)', () => {
  const enc = encryption();

  it('round-trips and never stores the plaintext', () => {
    const { stored } = sealDocumentNumber(enc, 'A1234567');

    expect(isSealed(stored)).toBe(true);
    expect(stored).not.toContain('A1234567');
    expect(openDocumentNumber(enc, stored)).toBe('A1234567');
  });

  it('produces a different ciphertext each time but the same blind index', () => {
    const a = sealDocumentNumber(enc, 'A1234567');
    const b = sealDocumentNumber(enc, 'A1234567');

    expect(a.stored).not.toBe(b.stored);
    expect(a.hash).toBe(b.hash);
  });

  it('the blind index ignores case, spaces and dashes', () => {
    expect(normaliseDocumentNumber(' ab-123 45 ')).toBe('AB12345');
    expect(sealDocumentNumber(enc, 'ab-123 45').hash).toBe(sealDocumentNumber(enc, 'AB12345').hash);
    expect(sealDocumentNumber(enc, 'AB12345').hash).not.toBe(sealDocumentNumber(enc, 'AB12346').hash);
  });

  it('reads legacy plaintext rows as they are', () => {
    expect(openDocumentNumber(enc, 'LEGACY123')).toBe('LEGACY123');
  });
});

describe('KycService with encryption (issue #1535)', () => {
  const enc = encryption();
  const dto = { userId: 'user-1', documentType: 'passport', documentNumber: 'A1234567', documentUrl: 'https://storage.example.com/doc.pdf' };

  function build(opts: { duplicateOwner?: string } = {}) {
    const manager = {
      findOne: jest
        .fn()
        // 1st lookup: active submission for this user; 2nd: same hash on another user.
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(opts.duplicateOwner ? { id: 'other-doc', userId: opts.duplicateOwner } : null),
      create: jest.fn((_e: unknown, v: any) => ({ id: 'doc-1', ...v })),
      save: jest.fn(async (_e: unknown, v: any) => v),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager,
    };
    const events = { emit: jest.fn() } as unknown as EventEmitter2;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new KycService(
      {} as any,
      events,
      { get: jest.fn().mockReturnValue('storage.example.com') } as any,
      { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } as any,
      audit as any,
      enc,
    );
    return { service, manager, events, audit };
  }

  it('stores the number sealed, with its blind index', async () => {
    const { service, manager } = build();

    await service.submit(dto);

    const stored = manager.create.mock.calls[0][1] as KycDocument;
    expect(isSealed(stored.documentNumber)).toBe(true);
    expect(stored.documentNumber).not.toContain('A1234567');
    expect(stored.documentNumberHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a number already used by another user with 409 and flags it', async () => {
    const { service, events, audit } = build({ duplicateOwner: 'user-2' });

    await expect(service.submit(dto)).rejects.toBeInstanceOf(ConflictException);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kyc.duplicate_document_number', after: { otherUserId: 'user-2' } }),
    );
    expect(events.emit).toHaveBeenCalledWith('kyc.duplicate_document_number', { userId: 'user-1', otherUserId: 'user-2' });
  });

  it('the API view carries only the last four characters', () => {
    const { service } = build();
    const { stored } = sealDocumentNumber(enc, 'A1234567');

    const view = service.toView({
      id: 'd1',
      userId: 'user-1',
      documentType: 'passport',
      documentNumber: stored,
      documentUrl: 'https://storage.example.com/doc.pdf',
      status: KycDocumentStatus.PENDING,
      createdAt: new Date(),
    } as KycDocument);

    expect(view.documentNumberLast4).toBe('4567');
    expect(JSON.stringify(view)).not.toMatch(/A1234567|storage\.example\.com|enc:/);
  });
});
