import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileWatchlistProvider } from './file-watchlist.provider';
import { DEFAULT_WATCHLIST } from './default-watchlist';

function configWith(path: string): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'aml.watchlistPath' ? path : undefined,
    ),
  } as unknown as ConfigService;
}

describe('FileWatchlistProvider', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aml-watchlist-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the built-in watchlist when no path is configured', async () => {
    const provider = new FileWatchlistProvider(configWith(''));
    expect(await provider.getEntries()).toEqual(DEFAULT_WATCHLIST);
  });

  it('filters entries by watchlist type', async () => {
    const provider = new FileWatchlistProvider(configWith(''));
    const sanctions = await provider.getEntries('sanctions');
    const peps = await provider.getEntries('pep');
    expect(sanctions.length).toBeGreaterThan(0);
    expect(sanctions.every((entry) => entry.type === 'sanctions')).toBe(true);
    expect(peps.every((entry) => entry.type === 'pep')).toBe(true);
  });

  it('loads entries from the configured file', async () => {
    const file = join(dir, 'watchlist.json');
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'Example Person', type: 'pep', dateOfBirth: '1980-01-01' },
      ]),
    );
    const provider = new FileWatchlistProvider(configWith(file));
    expect(await provider.getEntries()).toEqual([
      {
        name: 'Example Person',
        type: 'pep',
        dateOfBirth: '1980-01-01',
      },
    ]);
  });

  it('rejects an invalid file rather than screening against an empty list', async () => {
    const file = join(dir, 'invalid.json');
    writeFileSync(file, JSON.stringify([{ name: '', type: 'pep' }]));
    const provider = new FileWatchlistProvider(configWith(file));
    await expect(provider.getEntries()).rejects.toThrow(/non-empty name/);
  });

  it('does not contain job-title PEP entries', () => {
    const titles = [
      'minister',
      'king',
      'queen',
      'general',
      'prince',
      'president',
    ];
    for (const entry of DEFAULT_WATCHLIST) {
      expect(titles).not.toContain(entry.name.toLowerCase());
    }
  });
});
