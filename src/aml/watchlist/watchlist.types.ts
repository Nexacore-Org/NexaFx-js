export type WatchlistType = 'sanctions' | 'pep';

export interface WatchlistEntry {
  name: string;
  type: WatchlistType;
  dateOfBirth?: string;
  source?: string;
}

export interface WatchlistProvider {
  getEntries(
    type?: WatchlistType,
  ): Promise<WatchlistEntry[]> | WatchlistEntry[];
}

export const WATCHLIST_PROVIDER = Symbol('WATCHLIST_PROVIDER');
