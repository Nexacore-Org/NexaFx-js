import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface BiometricPayload {
  sub: string;
  verified: boolean;
  iat: number;
  exp: number;
}

/**
 * Verifies a biometric attestation token for high-risk operations.
 * The token must be a valid JWT signed with the biometric secret,
 * containing a `verified: true` claim and matching the authenticated user.
 */
@Injectable()
export class BiometricGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const biometricToken = request.headers['x-biometric-token'];

    if (!biometricToken) {
      throw new UnauthorizedException('Biometric token required');
    }

    const biometricSecret = this.configService.get<string>('BIOMETRIC_SECRET');
    if (!biometricSecret) {
      throw new UnauthorizedException('Biometric verification not configured');
    }

    try {
      const decoded = this.jwtService.verify<BiometricPayload>(biometricToken, {
        secret: biometricSecret,
      });

      if (!decoded.verified) {
        throw new UnauthorizedException('Biometric attestation not verified');
      }

      if (decoded.sub !== request.user?.sub) {
        throw new UnauthorizedException('Biometric token does not match authenticated user');
      }

      request.biometric = {
        verified: true,
        timestamp: decoded.iat,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired biometric token');
    }
  }
}
