import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export interface SanctionsEntry {
  id: string;
  address?: string;
  name?: string;
  addedAt: Date;
  reason: string;
}

export interface ScreeningResult {
  blocked: boolean;
  matchedEntry?: SanctionsEntry;
  reason?: string;
}

@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);

  private readonly blocklist: Map<string, SanctionsEntry> = new Map();
  private readonly cache: Map<string, { result: ScreeningResult; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  addEntry(entry: Omit<SanctionsEntry, 'id' | 'addedAt'>): SanctionsEntry {
    const newEntry: SanctionsEntry = {
      id: crypto.randomUUID(),
      ...entry,
      addedAt: new Date(),
    };
    this.blocklist.set(newEntry.id, newEntry);
    this.cache.clear();
    this.logger.log(`Sanctions entry added: ${newEntry.id}`);
    return newEntry;
  }

  removeEntry(id: string): void {
    if (!this.blocklist.has(id)) throw new NotFoundException(`Sanctions entry ${id} not found`);
    this.blocklist.delete(id);
    this.cache.clear();
    this.logger.log(`Sanctions entry removed: ${id}`);
  }

  listEntries(): SanctionsEntry[] {
    return Array.from(this.blocklist.values());
  }

  screenAddress(address: string): ScreeningResult {
    const cached = this.cache.get(address);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const match = Array.from(this.blocklist.values()).find(
      (e) => e.address === address,
    );

    const result: ScreeningResult = match
      ? { blocked: true, matchedEntry: match, reason: 'SANCTIONS_MATCH' }
      : { blocked: false };

    this.cache.set(address, { result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  screenName(name: string): ScreeningResult {
    const lower = name.toLowerCase();
    const match = Array.from(this.blocklist.values()).find(
      (e) => e.name && e.name.toLowerCase().includes(lower),
    );
    return match
      ? { blocked: true, matchedEntry: match, reason: 'SANCTIONS_MATCH' }
      : { blocked: false };
  }

  assertNotSanctioned(address: string): void {
    const result = this.screenAddress(address);
    if (result.blocked) {
      this.logger.warn(`Sanctioned address blocked: ${address}`);
      throw new ForbiddenException('SANCTIONS_MATCH');
    }
  }
}
