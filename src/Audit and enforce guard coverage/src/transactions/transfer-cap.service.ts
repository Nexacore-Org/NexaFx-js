import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class TransferCapService {
  private readonly logger = new Logger(TransferCapService.name);
  private readonly MAX_TRANSFER_AMOUNT = 10000; // configurable

  isTransferAllowed(amount: number): boolean {
    if (amount > this.MAX_TRANSFER_AMOUNT) {
      this.logger.warn(`Transfer cap exceeded: ${amount}`);
      return false;
    }
    return true;
  }
}
