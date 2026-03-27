import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SplitPaymentService } from '../services/split-payment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitPayment } from '../entities/split-payment.entity';

@Controller('split-payments')
@UseGuards(JwtAuthGuard)
export class SplitPaymentController {
  constructor(
    private readonly splitService: SplitPaymentService,
    @InjectRepository(SplitPayment) private splitRepo: Repository<SplitPayment>
  ) {}

  @Post()
  async create(@Req() req, @Body() body: { totalAmount: number; participants: string[] }) {
    return this.splitService.createSplit(req.user.id, body.totalAmount, body.participants);
  }

  @Post(':id/contribute')
  async contribute(@Param('id') id: string, @Req() req) {
    return this.splitService.processContribution(id, req.user.id);
  }

  @Get()
  async list(@Req() req) {
    return this.splitRepo.find({
      where: [
        { initiatorId: req.user.id },
        { contributions: { participantId: req.user.id } }
      ],
      relations: ['contributions']
    });
  }
}