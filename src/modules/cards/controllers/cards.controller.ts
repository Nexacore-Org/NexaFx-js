import { Controller, Post, Patch, Param, Body, Req, Get, UseGuards } from '@nestjs/common';
import { CardService } from '../services/card.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post('virtual')
  async issueCard(@Req() req: any, @Body() body: any) {
    return this.cardService.createCard(req.user.id, body.walletId, {
      tx: body.perTransactionLimit,
      monthly: body.monthlySpendLimit,
    });
  }

  @Patch(':id/freeze')
  async freeze(@Param('id') id: string, @Req() req: any) {
    return this.cardService.freezeCard(id, req.user.id);
  }

  @Post(':id/transactions')
  async createTransaction(@Param('id') id: string, @Body('amount') amount: number) {
    return this.cardService.processTransaction(id, amount);
  }
}