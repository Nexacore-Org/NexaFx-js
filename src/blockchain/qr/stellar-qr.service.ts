import { Injectable } from '@nestjs/common';

@Injectable()
export class StellarQrService {
  generatePaymentQrUri(publicKey: string, amount?: string, memo?: string): string {
    let uri = `web+stellar:pay?destination=${publicKey}`;
    if (amount) uri += `&amount=${amount}`;
    if (memo) uri += `&memo=${encodeURIComponent(memo)}`;
    return uri;
  }

  generateReceiveQrUri(publicKey: string): string {
    return `web+stellar:pay?destination=${publicKey}`;
  }

  parseQrUri(uri: string): Record<string, string> {
    const params = new URLSearchParams(uri.replace('web+stellar:pay?', ''));
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
