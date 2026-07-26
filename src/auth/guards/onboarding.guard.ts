import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export enum OnboardingState {
  UNVERIFIED = 'unverified',
  EMAIL_VERIFIED = 'email_verified',
  KYC_SUBMITTED = 'kyc_submitted',
  KYC_APPROVED = 'kyc_approved',
}

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) return false;
    
    const requiresOnboarding = this.reflector.getAllAndOverride<boolean>('requiresOnboarding', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (requiresOnboarding === false) return true;
    
    if (!user.isEmailVerified) {
      throw new ForbiddenException({ requiresAction: 'verify_email', message: 'Email verification required' });
    }
    
    return true;
  }
}
