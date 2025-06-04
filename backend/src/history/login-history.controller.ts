import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Param,
    UseGuards,
    Req,
    ParseIntPipe,
  } from '@nestjs/common';
  import { LoginHistoryService } from './login-history.service';
  import { CreateLoginHistoryDto, LoginHistoryQueryDto } from './login-history.dto';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // Assuming you have JWT auth
  import { Request } from 'express';
  
  interface AuthenticatedRequest extends Request {
    user: {
      userId: number;
      email: string;
    };
  }
  
  @Controller('login-history')
  export class LoginHistoryController {
    constructor(private readonly loginHistoryService: LoginHistoryService) {}
  
    @Post()
    async create(@Body() createLoginHistoryDto: CreateLoginHistoryDto) {
      return await this.loginHistoryService.create(createLoginHistoryDto);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('my-history')
    async getMyLoginHistory(
      @Req() req: AuthenticatedRequest,
      @Query() query: LoginHistoryQueryDto,
    ) {
      return await this.loginHistoryService.findByUserId(req.user.userId, query);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('my-stats')
    async getMyLoginStats(
      @Req() req: AuthenticatedRequest,
      @Query('days', ParseIntPipe) days: number = 30,
    ) {
      return await this.loginHistoryService.getLoginStats(req.user.userId, days);
    }
  
    @UseGuards(JwtAuthGuard)
    @Get('user/:userId')
    async getUserLoginHistory(
      @Param('userId', ParseIntPipe) userId: number,
      @Query() query: LoginHistoryQueryDto,
    ) {
      // Add admin check here if needed
      return await this.loginHistoryService.findByUserId(userId, query);
    }
  }
  