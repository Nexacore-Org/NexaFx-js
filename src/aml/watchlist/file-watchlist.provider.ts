import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { DEFAULT_WATCHLIST } from './default-watchlist';
import {
  WatchlistEntry,
  WatchlistProvider,
  WatchlistType,
} from './watchlist.types';

@Injectable()
export class FileWatchlistProvider implements WatchlistProvider {
  private cachedPath: string | undefined;
  private cachedEntries: WatchlistEntry[] = [];

  constructor(private readonly config: ConfigService) {}

  async getEntries(type?: WatchlistType): Promise<WatchlistEntry[]> {
    await Promise.resolve();
    const path = this.config.get<string>('aml.watchlistPath') || '';
    if (!path) return this.filter(DEFAULT_WATCHLIST, type);

    if (this.cachedPath !== path) {
      this.cachedEntries = this.load(path);
      this.cachedPath = path;
    }
    return this.filter(this.cachedEntries, type);
  }

  private filter(
    entries: WatchlistEntry[],
    type?: WatchlistType,
  ): WatchlistEntry[] {
    return type ? entries.filter((entry) => entry.type === type) : entries;
  }

  private load(path: string): WatchlistEntry[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new Error(
        `Unable to read AML watchlist file at ${path}: ${(error as Error).message}`,
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error('AML watchlist file must contain an array of entries');
    }
    return parsed.map((entry: unknown, index: number) =>
      this.toEntry(entry, index),
    );
  }

  private toEntry(value: unknown, index: number): WatchlistEntry {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`AML watchlist entry ${index} must be an object`);
    }
    const raw = value as Record<string, unknown>;
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      throw new Error(`AML watchlist entry ${index} requires a non-empty name`);
    }
    if (raw.type !== 'sanctions' && raw.type !== 'pep') {
      throw new Error(
        `AML watchlist entry ${index} has an invalid type: ${String(raw.type)}`,
      );
    }
    if (raw.dateOfBirth !== undefined && typeof raw.dateOfBirth !== 'string') {
      throw new Error(
        `AML watchlist entry ${index} has an invalid dateOfBirth`,
      );
    }
    if (raw.source !== undefined && typeof raw.source !== 'string') {
      throw new Error(`AML watchlist entry ${index} has an invalid source`);
    }
    return {
      name: raw.name,
      type: raw.type,
      ...(raw.dateOfBirth ? { dateOfBirth: raw.dateOfBirth } : {}),
      ...(raw.source ? { source: raw.source } : {}),
    };
  }
}
