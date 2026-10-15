import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ExportStorageService } from './export-storage.service';

describe('ExportStorageService download tokens', () => {
  const jwtService = new JwtService({ secret: 'access-secret' });
  const config = { get: jest.fn(() => 'access-secret') } as unknown as ConfigService;
  const service = new ExportStorageService(jwtService, config);

  it('rejects an access-token-signed token as a download link', () => {
    const token = jwtService.sign({ jobId: 'job-1', filename: 'job-1.csv', typ: 'export-download' });
    expect(() => service.resolve('job-1', token)).toThrow(ForbiddenException);
  });
});
