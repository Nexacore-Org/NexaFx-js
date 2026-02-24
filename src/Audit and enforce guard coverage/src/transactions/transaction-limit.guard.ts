import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { TransactionLimitService } from "./transaction-limit.service";

@Injectable()
export class TransactionLimitGuard implements CanActivate {
  constructor(private readonly limitService: TransactionLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.body?.userId || request.user?.id;
    if (!userId) return true;
    if (this.limitService.isRateLimited(userId)) {
      throw new ForbiddenException("Transaction rate limit exceeded. Please try again later.");
    }
    this.limitService.recordTransaction(userId);
    return true;
  }
}
