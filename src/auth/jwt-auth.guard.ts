import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthenticatedUser } from './authenticated-user.interface';
import { TokenType } from './token-types';
import { AccountStatusService } from './account-status.service';
import { JwtPayload, buildPrincipal } from './jwt-payload';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';

interface JwtPayload {
  sub?: string;
  typ?: string;
  isEmailVerified?: boolean;
  email?: string;
  role?: string;
  roles?: string[];
  /** Token version, bumped when a role/status change must invalidate old tokens. */
  tv?: number;
  /** Refresh-token session id. */
  sid?: string;
  impersonation?: boolean;
  act?: { sub?: string };
  /** Refresh-token session this access token belongs to. */
  sid?: string;
}

interface AuthenticatedRequest {
  headers: {
    authorization?: string | string[];
  };
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @Optional() private readonly accountStatus?: AccountStatusService,
    @Optional() private readonly refreshTokens?: RefreshTokensService,
    private readonly accountStatus: AccountStatusService,
  ) {}

  private getRequest(context: ExecutionContext): AuthenticatedRequest {
    if ((context.getType() as string) === 'graphql') {
      try {
        const { GqlExecutionContext } = require('@nestjs/graphql');
        const gqlContext = GqlExecutionContext.create(context);
        return gqlContext.getContext().req;
      } catch {
        const args = context.getArgs();
        return (
          args[2]?.req || context.switchToHttp().getRequest<AuthenticatedRequest>()
        );
      }
    }
    return context.switchToHttp().getRequest<AuthenticatedRequest>();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = this.getRequest(context);

    // Already authenticated by the API-key guard on an `@ApiKeyAllowed` route.
    if (request.user?.authMethod === 'api_key') {
      return true;
    }

    const authorization = request.headers.authorization;
    const bearerToken = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    const token =
      typeof bearerToken === 'string' && bearerToken.startsWith('Bearer ')
        ? bearerToken.slice(7)
        : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      const secret = String(this.config.get('jwt.secret') ?? '');
      payload = this.jwtService.verify<JwtPayload>(token, { secret });
    } catch {
      // Only invalid/expired signatures are re-labelled here; deliberate
      // UnauthorizedExceptions below are thrown outside this block.
      throw new UnauthorizedException('Invalid authentication token');
    }

    if (payload.typ !== TokenType.ACCESS || !payload.sub) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    // A signed token is not enough: suspended, deactivated and deleted users lose access
    // immediately, and a token issued before a password change is refused (same shared check
    // the passport strategy uses).
    if (this.accountStatus) {
      await this.accountStatus.assertTokenAccepted(payload);
    }

    request.user = buildPrincipal(payload);
    // A signed token is not enough: suspended, deactivated and deleted users
    // lose access immediately even though their token has not expired.
    if (!(await this.accountStatus.isAllowedToAuthenticate(payload.sub))) {
      throw new UnauthorizedException('Account is not active');
    }

    // "Log out" and "revoke this device" must end the session now, not when the (up to one hour)
    // access token expires: the token names its session (`sid`), which must still be active.
    if (payload.sid && this.refreshTokens && !(await this.refreshTokens.isSessionActive(payload.sub, payload.sid))) {
      throw new UnauthorizedException('Session has been revoked');
    }

    request.user = {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email ?? '',
      role: payload.role ?? '',
      isEmailVerified: payload.isEmailVerified,
      ...(payload.sid ? { sid: payload.sid } : {}),
      tokenVersion: payload.tv,
      sid: payload.sid,
      authMethod: 'jwt',
      ...(payload.impersonation
        ? { impersonation: true, actorId: payload.act?.sub }
        : {}),
    };
    return true;
  }
}
