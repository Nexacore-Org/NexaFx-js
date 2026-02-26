import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { SecretsService } from '../../secrets/services/secrets.service';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly secretsService: SecretsService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('JWT token required');
    }

    const token = authHeader.split(' ')[1];

    // Retrieve all currently valid JWT secrets (active + grace-period versions)
    const secrets = await this.secretsService.getValidSecrets('JWT');

    for (const secret of secrets) {
      try {
        const payload: any = jwt.verify(token, secret);
        
        // Check if user is soft deleted or inactive
        const isValid = await this.authService.verifyUserIsActive(payload.sub || payload.id);
        if (!isValid) {
          throw new UnauthorizedException('Account has been deactivated');
        }
        
        request.user = payload;
        return true;
      } catch (error) {
        // If it's our specific user validation error, re-throw it
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Otherwise, continue trying other secrets
      }
    }

    throw new UnauthorizedException('Invalid or expired JWT token');
  }
}
