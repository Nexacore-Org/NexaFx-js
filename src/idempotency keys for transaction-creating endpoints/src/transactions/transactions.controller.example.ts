import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { IdempotencyGuard } from "../idempotency/idempotency.guard";
import { IdempotencyInterceptor } from "../idempotency/idempotency.interceptor";
import { Idempotent } from "../idempotency/idempotency.decorator";

@Controller("transactions")
@UseGuards(IdempotencyGuard)
@UseInterceptors(IdempotencyInterceptor)
export class TransactionsController {
  @Post()
  @Idempotent()
  async createTransaction(@Body() dto: any) {
    // Your transaction logic here
    return { id: "txn_123", amount: dto.amount, status: "completed" };
  }

  @Post("transfer")
  @Idempotent()
  async transfer(@Body() dto: any) {
    // Your transfer logic here
    return { id: "transfer_456", from: dto.from, to: dto.to };
  }

  @Post("deposit")
  @Idempotent()
  async deposit(@Body() dto: any) {
    // Your deposit logic here
    return { id: "deposit_789", amount: dto.amount };
  }

  @Post("withdraw")
  @Idempotent()
  async withdraw(@Body() dto: any) {
    // Your withdraw logic here
    return { id: "withdraw_012", amount: dto.amount };
  }
}
