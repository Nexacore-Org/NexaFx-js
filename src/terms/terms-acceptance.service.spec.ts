import { ConfigService } from '@nestjs/config';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { TermsAcceptance } from './terms-acceptance.entity';
import { Repository } from 'typeorm';

describe('TermsAcceptanceService', () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  const service = new TermsAcceptanceService(
    repository as unknown as Repository<TermsAcceptance>,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records accepted terms with the configured version', async () => {
    (config.get as jest.Mock).mockReturnValue('2.1');
    const record = { id: '1', version: '2.1' } as TermsAcceptance;
    repository.create.mockReturnValue(record);
    repository.save.mockResolvedValue(record);

    await expect(
      service.accept({ userId: 'user-1', ipAddress: '127.0.0.1' }),
    ).resolves.toBe(record);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        version: '2.1',
      }),
    );
  });

  it('throws when the current terms version has not been accepted', async () => {
    (config.get as jest.Mock).mockReturnValue('3.0');
    repository.findOne.mockResolvedValue(null);

    await expect(service.ensureAccepted('user-1')).rejects.toMatchObject({
      response: {
        requiresAction: 'accept_terms',
        version: '3.0',
      },
    });
  });
});
