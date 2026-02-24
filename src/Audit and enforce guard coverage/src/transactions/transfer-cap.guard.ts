import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { TransferCapService } from "./transfer-cap.service";

@Injectable()
export class TransferCapGuard implements CanActivate {
  constructor(private readonly capService: TransferCapService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const amount = request.body?.amount;
    if (amount === undefined) return true;
    if (!this.capService.isTransferAllowed(amount)) {
      throw new ForbiddenException("Transfer amount exceeds allowed cap.");
    }
    return true;
  }
}
