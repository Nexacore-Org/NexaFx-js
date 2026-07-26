import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { UsersService } from '../users/users.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { MailService } from '../mail/mail.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const hashPassword = (password: string): string =>
  createHash('sha256').update(password).digest('hex');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly termsService: TermsAcceptanceService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly deactivationService: UserDeactivationService,
    private readonly mailService: MailService,
    private readonly events: EventEmitter2,
    private readonly configService: ConfigService,
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

    await this.termsService.accept({
      userId: user.id,
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
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
    dto: LoginDto,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // #910: Check if 2FA enforcement is enabled for admin accounts
    if (user.role === 'admin' && user.require2fa && !dto.totpCode) {
      throw new ForbiddenException('2FA code required for admin accounts');
    }

    // #911: Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        `Account is locked until ${user.lockedUntil.toISOString()}. Try again later.`,
      );
    }

    const expected = Buffer.from(user.passwordHash);
    const actual = Buffer.from(hashPassword(dto.password));
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      // #911: Increment failed attempts and lock if threshold exceeded
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_MINUTES);
        user.lockedUntil = lockoutUntil;

        await this.usersService.update(user.id, {
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil,
        });

        // Send lockout notification email
        try {
          await this.mailService.sendAdminAlert({
            to: user.email,
            subject: 'Account Locked — Too Many Failed Login Attempts',
            body:
              `Your account has been locked for ${LOCKOUT_MINUTES} minutes due to ${MAX_FAILED_ATTEMPTS} consecutive failed login attempts.` +
              ` If this was not you, please reset your password immediately.`,
          });
        } catch (err) {
          // Log but don't fail the login flow
        }

        this.events.emit('admin.alert.account-lockout', {
          type: 'account-lockout',
          severity: 'high',
          title: 'Account Locked',
          message: `Account ${user.email} locked after ${MAX_FAILED_ATTEMPTS} failed attempts`,
          metadata: { userId: user.id, email: user.email },
        });
      } else {
        await this.usersService.update(user.id, {
          failedLoginAttempts: user.failedLoginAttempts,
        });
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — reset failed attempts and lockout
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.usersService.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    await this.termsService.ensureAccepted(user.id);

    const isDeactivated = await this.deactivationService.isUserDeactivated(user.id);
    if (isDeactivated) {
      throw new UnauthorizedException('Account has been deactivated by an administrator');
    }

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
