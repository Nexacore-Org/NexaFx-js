import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';

@Injectable()
export class LargeWithdrawalGuard implements CanActivate {
  private threshold = Number(process.env.WITHDRAWAL_LARGE_AMOUNT_THRESHOLD_USD) || 10000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const amount = request.body?.amount || 0;

    if (amount >= this.threshold) {
      const otp = request.headers['x-verification-code'];
      if (!otp) {
        throw new HttpException('Large withdrawal requires verification code', 403);
      }
    }
    return true;
  }
}
