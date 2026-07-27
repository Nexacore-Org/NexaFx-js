// Biometric authentication guard for high-risk operations
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BiometricGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const biometricToken = request.headers['x-biometric-token'];

    if (!biometricToken) {
      throw new UnauthorizedException('Biometric token required');
    }

    try {
      const decoded = this.verifyToken(biometricToken);
      request.biometric = decoded;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid biometric token');
    }
  }

  private verifyToken(token: string): any {
    // Simple token verification (stub)
    return { verified: true, timestamp: Date.now() };
  }
}
