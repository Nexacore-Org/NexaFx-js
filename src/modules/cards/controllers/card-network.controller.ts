import { Controller, Post, Get, Body, Param, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthorizationService, AuthorizationRequest } from '../services/authorization.service';

@ApiTags('Card Network')
@Controller('cards')
export class CardNetworkController {
  constructor(private readonly authService: AuthorizationService) {}

  @Post('webhooks/authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive card authorization request from card network (HMAC-verified)' })
  authorize(@Body() req: AuthorizationRequest) {
    return this.authService.authorize(req);
  }

  @Get(':id/authorizations')
  @ApiOperation({ summary: 'Get real-time authorization log for a card' })
  getAuthorizationLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.authService.getAuthorizationLog(id);
  }
}
