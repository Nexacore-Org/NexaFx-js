import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { SecretsService } from '../../secrets/services/secrets.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly secretsService: SecretsService) {}

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
        const payload = jwt.verify(token, secret);
        request.user = payload;
        return true;
      } catch {
        // Try next secret version
      }
    }

    throw new UnauthorizedException('Invalid or expired JWT token');
  }
}
