import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class FingerprintAnalysisMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FingerprintAnalysisMiddleware.name);

  constructor(private fingerprintService: FingerprintAnalysisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const analysis = await this.fingerprintService.analyzeRequest(req);
      
      // Attach analysis to request for use in controllers
      (req as any).fingerprintAnalysis = analysis;

      // Log high-risk requests
      if (analysis.riskScore > 70) {
        this.logger.warn(`High-risk request detected`, {
          fingerprint: analysis.fingerprint,
          riskScore: analysis.riskScore,
          anomalies: analysis.anomalies.map(a => a.type),
          userAgent: analysis.userAgent,
          ip: analysis.ipAddress
        });
      }

      // Optionally block very high-risk requests
      if (analysis.riskScore > 90) {
        this.logger.error(`Blocking high-risk request`, { fingerprint: analysis.fingerprint });
        return res.status(429).json({
          error: 'Request blocked due to suspicious activity',
          riskScore: analysis.riskScore
        });
      }

    } catch (error) {
      this.logger.error('Error in fingerprint analysis', error);
    }

    next();
  }
}
