import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ExportStorageService } from './export-storage.service';

describe('ExportStorageService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const service = new ExportStorageService(jwtService);

  it('issues a download URL that resolves back to the stored file', () => {
    const sourcePath = join(tmpdir(), `export-test-${Date.now()}.csv`);
    writeFileSync(sourcePath, 'id\n1\n');

    const { downloadUrl, expiresAt } = service.store(sourcePath, 'job-1', 'csv');
    const token = new URL(downloadUrl, 'http://localhost').searchParams.get('token')!;

    const resolvedPath = service.resolve('job-1', token);
    expect(existsSync(resolvedPath)).toBe(true);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    rmSync(resolvedPath, { force: true });
  });

  it('rejects a token issued for a different job', () => {
    const sourcePath = join(tmpdir(), `export-test-${Date.now()}-b.csv`);
    writeFileSync(sourcePath, 'id\n1\n');
    const { downloadUrl } = service.store(sourcePath, 'job-2', 'csv');
    const token = new URL(downloadUrl, 'http://localhost').searchParams.get('token')!;

    expect(() => service.resolve('job-other', token)).toThrow(ForbiddenException);

    rmSync(join(process.cwd(), 'tmp', 'exports', 'job-2.csv'), { force: true });
  });
});
