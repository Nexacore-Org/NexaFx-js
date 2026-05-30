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
}
