import 'reflect-metadata';
import { Writable } from 'stream';
import type { Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtAuthGuard as PassportJwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { KycController } from '../kyc/kyc.controller';
import { ReferralController } from '../referral/referral.controller';
import { DevicesController } from '../notifications/devices.controller';
import { DocumentsController } from '../documents/documents.controller';
import { NotificationPreferencesController } from '../notification-preferences/notification-preferences.controller';
import { ActivityFeedController } from '../activity-feed/activity-feed.controller';

jest.mock('./jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));

const GUARDS_METADATA = '__guards__';

const hasJwtGuard = (target: object, method?: string): boolean =>
  guardsFor(target, method).some(
    (guard) => guard === JwtAuthGuard || guard === PassportJwtAuthGuard,
  );

const guardMetadata = (target: object): unknown[] => {
  const value: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
  return Array.isArray(value) ? value : [];
};

const guardsFor = (target: object, method?: string): unknown[] => [
  ...guardMetadata(target),
  ...(method
    ? guardMetadata(
        (target as { prototype: Record<string, unknown> }).prototype[
          method
        ] as object,
      )
    : []),
];

describe('authentication guards on user-scoped controllers', () => {
  it.each([
    ['KycController', KycController],
    ['ReferralController', ReferralController],
    ['DevicesController', DevicesController],
    ['NotificationPreferencesController', NotificationPreferencesController],
    ['ActivityFeedController', ActivityFeedController],
  ])('%s requires authentication for every route', (_name, controller) => {
    expect(hasJwtGuard(controller)).toBe(true);
  });

  it.each([['downloadStatement'], ['downloadReceipt']])(
    'DocumentsController.%s requires authentication',
    (method) => {
      expect(hasJwtGuard(DocumentsController, method)).toBe(true);
    },
  );

  it.each([['qualify'], ['reward']])(
    'ReferralController.%s is restricted to admins',
    (method) => {
      expect(guardsFor(ReferralController, method)).toContain(AdminRoleGuard);
    },
  );
});

describe('handlers use the authenticated principal, not caller-supplied input', () => {
  const request = { user: { sub: 'caller-1' } };

  it('KycController.submit binds the submission to the caller', async () => {
    const kycService = {
      submit: jest.fn(),
      toView: jest.fn((value: unknown): unknown => value),
    };
    const controller = new KycController(kycService as any);

    await controller.submit(request, {
      userId: 'victim-1',
      documentType: 'passport',
      documentNumber: 'X1',
      documentUrl: 'https://storage.example.com/x1.png',
    } as any);

    expect(kycService.submit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'caller-1' }),
    );
  });

  it('KycController.appeal passes the caller through for the ownership check', async () => {
    const kycService = {
      appeal: jest.fn(),
      toView: jest.fn((value: unknown): unknown => value),
    };
    const controller = new KycController(kycService as any);

    await controller.appeal(request, 'doc-1', {
      reason: 'please reconsider',
    });

    expect(kycService.appeal).toHaveBeenCalledWith(
      'doc-1',
      'please reconsider',
      'caller-1',
    );
  });

  it("KycController.checkExpiry rejects another user's id", async () => {
    const kycService = {
      checkExpiry: jest.fn(),
      toView: jest.fn((value: unknown): unknown => value),
    };
    const controller = new KycController(kycService as any);

    expect(() => controller.checkExpiry(request, 'victim-1')).toThrow(
      'You can only check your own KYC expiry status',
    );
    expect(kycService.checkExpiry).not.toHaveBeenCalled();

    await controller.checkExpiry(request, 'caller-1');
    expect(kycService.checkExpiry).toHaveBeenCalledWith('caller-1');
  });

  it('DevicesController.register binds the push token to the caller', () => {
    const pushService = {
      registerToken: jest.fn(),
      deregisterToken: jest.fn(),
    };
    const controller = new DevicesController(pushService as any);

    controller.register(request, {
      userId: 'victim-1',
      token: 'tok-1',
      platform: 'android',
    } as any);

    expect(pushService.registerToken).toHaveBeenCalledWith(
      'caller-1',
      'tok-1',
      'android',
    );
  });

  it("DevicesController.deregister scopes the delete to the caller's devices", async () => {
    const pushService = {
      registerToken: jest.fn(),
      deregisterToken: jest.fn(),
    };
    const controller = new DevicesController(pushService as any);

    await controller.deregister(request, 'tok-1');

    expect(pushService.deregisterToken).toHaveBeenCalledWith(
      'tok-1',
      'caller-1',
    );
  });
});

describe('DocumentsController.downloadReceipt ownership', () => {
  const makeController = (transaction: unknown) => {
    const pdfService = { generateReceiptPdf: jest.fn() };
    const transactionRepo = {
      findOne: jest.fn().mockResolvedValue(transaction),
    };
    return {
      pdfService,
      controller: new DocumentsController(
        pdfService as any,
        transactionRepo as any,
      ),
    };
  };

  // Readable.from(pdf).pipe(res) needs a real writable sink.
  const res = (): Response => {
    const sink = new Writable({ write: (_chunk, _enc, cb) => cb() });
    (sink as unknown as { setHeader: jest.Mock }).setHeader = jest.fn();
    return sink as unknown as Response;
  };

  it("rejects a receipt for another user's transaction", async () => {
    const { controller, pdfService } = makeController({
      id: 'tx-1',
      senderId: 'other-1',
      receiverId: 'other-2',
    });

    await expect(
      controller.downloadReceipt('tx-1', { user: { sub: 'caller-1' } }, res()),
    ).rejects.toThrow('You can only download your own receipts');
    expect(pdfService.generateReceiptPdf).not.toHaveBeenCalled();
  });

  it('rejects a receipt for a transaction that does not exist', async () => {
    const { controller } = makeController(null);

    await expect(
      controller.downloadReceipt('tx-1', { user: { sub: 'caller-1' } }, res()),
    ).rejects.toThrow('Transaction tx-1 not found');
  });

  it('allows the counterparty of the transaction to download the receipt', async () => {
    const found = {
      id: 'tx-1',
      senderId: 'other-1',
      receiverId: 'caller-1',
    };
    const { controller, pdfService } = makeController(found);
    pdfService.generateReceiptPdf.mockResolvedValue(Buffer.from('%PDF-1.7'));

    await controller.downloadReceipt(
      'tx-1',
      { user: { sub: 'caller-1' } },
      res(),
    );

    expect(pdfService.generateReceiptPdf).toHaveBeenCalledWith(found);
  });
});
