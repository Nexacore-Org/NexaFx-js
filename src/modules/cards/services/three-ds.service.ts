import { Injectable } from '@nestjs/common';

const THREE_DS_THRESHOLD = Number(process.env.THREE_DS_THRESHOLD_AMOUNT ?? 500);

@Injectable()
export class ThreeDsService {
  /**
   * Returns a challenge redirect URL if the amount exceeds the 3DS threshold.
   */
  requiresChallenge(amount: number): boolean {
    return amount > THREE_DS_THRESHOLD;
  }

  generateRedirectUrl(cardId: string, requestId: string): string {
    const base = process.env.APP_BASE_URL ?? 'https://app.nexafx.io';
    return `${base}/3ds/challenge?cardId=${cardId}&requestId=${requestId}`;
  }
}
