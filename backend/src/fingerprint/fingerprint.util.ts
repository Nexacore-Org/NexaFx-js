import * as crypto from 'crypto';
import { Request } from 'express';

export class FingerprintUtil {
  static generateFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.headers['accept'] || '',
      req.ip || req.connection.remoteAddress || '',
      req.headers['x-forwarded-for'] || '',
    ];

    const fingerprintString = components.join('|');
    return crypto.createHash('sha256').update(fingerprintString).digest('hex');
  }

  static extractHeaders(req: Request): Record<string, string> {
    const relevantHeaders = [
      'user-agent', 'accept', 'accept-language', 'accept-encoding',
      'connection', 'cache-control', 'upgrade-insecure-requests',
      'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'
    ];

    const headers: Record<string, string> = {};
    relevantHeaders.forEach(header => {
      if (req.headers[header]) {
        headers[header] = req.headers[header] as string;
      }
    });

    return headers;
  }
}