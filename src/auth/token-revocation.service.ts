import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenRevocationService {
  private revokedTokenFamilies: Set<string> = new Set();

  revokeFamily(familyId: string) {
    this.revokedTokenFamilies.add(familyId);
  }

  isFamilyRevoked(familyId: string): boolean {
    return this.revokedTokenFamilies.has(familyId);
  }
}
