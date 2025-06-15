import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { Public } from './public.decorator';

@Controller('api')
@UseGuards(CsrfGuard)
export class ManualCsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  @Get('csrf-token')
  @Public()
  getCsrfToken(@Req() req: Request) {
    const sessionId = req.sessionID || 'default-session';
    const token = this.csrfService.generateToken(sessionId);
    
    return {
      csrfToken: token,
      sessionId: sessionId
    };
  }

  @Post('protected')
  protectedEndpoint(@Body() body: any) {
    return {
      message: 'Protected action completed successfully',
      data: body
    };
  }
}