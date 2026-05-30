import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { UsersService } from '../users/users.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { AuditService } from '../audit/audit.service';

export interface CredentialsDto {
  email: string;
  password: string;
}

export interface RegisterDto extends CredentialsDto {
  firstName: string;
  lastName: string;
}

export interface AuthUserPayload {
  sub: string;
  email: string;
  role: string;
}

const hashPassword = (password: string): string =>
  createHash('sha256').update(password).digest('hex');
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { RefreshToken } from './refresh-token.entity';

interface RefreshTokenClaims {
  sub: string;
  jti: string;
  familyId: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface IssuedTokenPair extends TokenPair {
  refreshTokenId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly termsService: TermsAcceptanceService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async register(
    dto: RegisterDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash: hashPassword(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    await this.auditService.log({
      userId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      after: { email: user.email },
    });

    return this.issueToken(user.id, user.email, user.role);
  }

  async login(
    dto: CredentialsDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expected = Buffer.from(user.passwordHash);
    const actual = Buffer.from(hashPassword(dto.password));
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.termsService.ensureAccepted(user.id);

    await this.auditService.log({
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    return this.issueToken(user.id, user.email, user.role);
  }

  private issueToken(userId: string, email: string, role: string) {
    return {
      accessToken: this.jwtService.sign({ sub: userId, email, role }),
    };
  }
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokenPair(userId: string): Promise<TokenPair> {
    const familyId = randomUUID();
    const issuedTokens = await this.createTokenPair(userId, familyId);

    return {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const currentToken = await this.resolveRefreshToken(refreshToken);

    if (currentToken.revokedAt) {
      await this.revokeFamily(currentToken.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const issuedTokens = await this.createTokenPair(
      currentToken.userId,
      currentToken.familyId,
      currentToken.id,
    );

    const now = new Date();
    await this.refreshTokenRepository.update(
      { id: currentToken.id },
      {
        revokedAt: now,
        lastUsedAt: now,
        replacedByTokenId: issuedTokens.refreshTokenId,
      },
    );

    return {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
    };
  }

  async logout(refreshToken: string): Promise<{ revoked: true }> {
    const currentToken = await this.resolveRefreshToken(refreshToken);

    if (currentToken.revokedAt && currentToken.replacedByTokenId) {
      await this.revokeFamily(currentToken.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (!currentToken.revokedAt) {
      const now = new Date();
      await this.refreshTokenRepository.update(
        { id: currentToken.id },
        {
          revokedAt: now,
          lastUsedAt: now,
        },
      );
    }

    return { revoked: true };
  }

  private async resolveRefreshToken(
    rawRefreshToken: string,
  ): Promise<RefreshToken> {
    const claims = await this.verifyRefreshToken(rawRefreshToken);
    const tokenHash = this.hashToken(rawRefreshToken);
    const currentToken = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!currentToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertClaimsMatch(currentToken, claims);

    if (currentToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return currentToken;
  }

  private assertClaimsMatch(
    currentToken: RefreshToken,
    claims: RefreshTokenClaims,
  ): void {
    if (
      currentToken.id !== claims.jti ||
      currentToken.userId !== claims.sub ||
      currentToken.familyId !== claims.familyId
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async createTokenPair(
    userId: string,
    familyId: string,
    parentTokenId: string | null = null,
  ): Promise<IssuedTokenPair> {
    const refreshTokenId = randomUUID();
    const refreshToken = await this.signRefreshToken(
      userId,
      familyId,
      refreshTokenId,
    );
    const accessToken = await this.signAccessToken(
      userId,
      familyId,
      refreshTokenId,
    );

    const refreshTokenRecord: RefreshToken = {
      id: refreshTokenId,
      userId,
      familyId,
      tokenHash: this.hashToken(refreshToken),
      parentTokenId,
      replacedByTokenId: null,
      expiresAt: this.buildExpiryDate('refreshToken.expiry'),
      revokedAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
    };

    await this.refreshTokenRepository.save(refreshTokenRecord);

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
    };
  }

  private async signAccessToken(
    userId: string,
    familyId: string,
    refreshTokenId: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userId,
        familyId,
        refreshTokenId,
      },
      {
        secret: this.configService.get<string>('jwt.secret') ?? '',
        expiresIn: this.configService.get<number>('jwt.expiry') ?? 3600,
      },
    );
  }

  private async signRefreshToken(
    userId: string,
    familyId: string,
    refreshTokenId: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userId,
        familyId,
        jti: refreshTokenId,
      },
      {
        secret: this.configService.get<string>('refreshToken.secret') ?? '',
        expiresIn:
          this.configService.get<number>('refreshToken.expiry') ?? 604800,
      },
    );
  }

  private async verifyRefreshToken(
    rawRefreshToken: string,
  ): Promise<RefreshTokenClaims> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenClaims>(
        rawRefreshToken,
        {
          secret: this.configService.get<string>('refreshToken.secret') ?? '',
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildExpiryDate(configPath: 'refreshToken.expiry'): Date {
    const expirySeconds = this.configService.get<number>(configPath) ?? 604800;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expirySeconds);
    return expiresAt;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { familyId },
      {
        revokedAt: new Date(),
      },
    );
  }
}
