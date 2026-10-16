import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../authenticated-user.interface';
import { TokenType } from '../token-types';
import { AccountStatusService } from '../account-status.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  iat: number;
  typ?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    @Optional() private readonly accountStatus?: AccountStatusService,
  ) {
    const secret = config.get<string>('jwt.secret');
    if (!secret) {
      throw new UnauthorizedException(
        'JWT_SECRET is not configured — cannot start JWT strategy',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== TokenType.ACCESS || !payload.sub) {
      throw new UnauthorizedException('Invalid authentication token');
    }
    // A missing (deleted) user is an authentication failure, not a 404.
    const user = await this.usersService.findByIdOrNull(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (this.accountStatus && !(await this.accountStatus.isAllowedToAuthenticate(payload.sub))) {
      throw new UnauthorizedException('Account is not active');
    }
    if (
      user.passwordChangedAt &&
      payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Token invalidated by password change');
    }
    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      isEmailVerified: payload.isEmailVerified,
    };
  }
}
