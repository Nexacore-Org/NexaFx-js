import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt.guard';
import { PaymentLinkService } from '../services/payment-link.service';

@ApiTags('payment-links')
@Controller('payment-links')
export class PaymentLinkController {
  constructor(private readonly paymentLinkService: PaymentLinkService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a shareable payment link' })
  create(@Request() req, @Body() dto: any) {
    return this.paymentLinkService.createPaymentLink(req.user.id, dto);
  }

  @Get(':code/status')
  @ApiOperation({ summary: 'Get payment link status (public, no auth required)' })
  @ApiParam({ name: 'code', description: 'Base62 payment link code' })
  getStatus(@Param('code') code: string) {
    return this.paymentLinkService.getStatus(code);
  }

  @Post(':code/pay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute payment via payment link' })
  @ApiParam({ name: 'code', description: 'Base62 payment link code' })
  pay(@Param('code') code: string, @Request() req) {
    return this.paymentLinkService.pay(code, req.user.id);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get analytics for a payment link (owner only)' })
  @ApiParam({ name: 'id', description: 'Payment link UUID' })
  getAnalytics(@Param('id') id: string, @Request() req) {
    return this.paymentLinkService.getAnalytics(id, req.user.id);
  }
}
