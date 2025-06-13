import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { IntrusionDetectionService } from './intrusion-detection.service';

@Injectable()
export class IntrusionDetectionGuard implements CanActivate {
  constructor(
    private readonly intrusionDetectionService: IntrusionDetectionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ipAddress = request.ip || request.connection.remoteAddress;
    const userAgent = request.headers['user-agent'] || '';
    const userId = request.user?.id;

    const result = await this.intrusionDetectionService.analyzeLoginAttempt(
      userId,
      ipAddress,
      userAgent,
      false, // This is a request, not necessarily a login
    );

    if (result.riskScore >= 90) {
      throw new HttpException(
        {
          message: 'Request blocked due to suspicious activity',
          riskScore: result.riskScore,
          reasons: result.reasons,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}