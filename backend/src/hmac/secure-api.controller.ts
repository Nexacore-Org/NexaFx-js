import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';

interface CriticalDataDto {
  userId: number;
  amount: number;
  currency: string;
  timestamp: string;
}

interface WebhookPayloadDto {
  event: string;
  data: any;
  timestamp: number;
}

@Controller('api')
@UseGuards(HmacGuard)
export class SecureApiController {
  private readonly logger = new Logger(SecureApiController.name);

  // Critical endpoint requiring HMAC validation
  @Post('critical-operation')
  @RequireHmac()
  async handleCriticalOperation(@Body() data: CriticalDataDto) {
    this.logger.log('Processing critical operation with validated payload');
    
    // Your critical business logic here
    return {
      success: true,
      message: 'Critical operation completed successfully',
      processedAt: new Date().toISOString(),
      data: {
        userId: data.userId,
        amount: data.amount,
        currency: data.currency
      }
    };
  }

  // Webhook endpoint with HMAC protection
  @Post('webhook')
  @RequireHmac()
  async handleWebhook(@Body() payload: WebhookPayloadDto) {
    this.logger.log(`Processing webhook event: ${payload.event}`);
    
    // Process webhook securely
    return {
      received: true,
      event: payload.event,
      processedAt: new Date().toISOString()
    };
  }

  // Regular endpoint without HMAC (for comparison)
  @Post('regular-operation')
  async handleRegularOperation(@Body() data: any) {
    return {
      success: true,
      message: 'Regular operation completed',
      data
    };
  }

  // GET endpoint with HMAC (validates query parameters)
  @Get('secure-data')
  @RequireHmac()
  async getSecureData(@Query('userId') userId: string) {
    return {
      userId,
      secureData: 'This data was accessed with valid HMAC',
      timestamp: new Date().toISOString()
    };
  }
}
