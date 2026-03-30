import {
  Controller, Post, Get, Patch, Delete,
  Param, Body, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScheduledTransactionService } from '../services/scheduled-transaction.service';
import { CreateScheduledTransactionDto, UpdateScheduledTransactionDto } from '../dto/scheduled-transaction.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

// Minimal CurrentUser decorator — reads req.user set by JwtAuthGuard
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().user,
);

@ApiTags('Scheduled Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions/schedule')
export class ScheduledTransactionController {
  constructor(private readonly service: ScheduledTransactionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a recurring scheduled transaction' })
  create(@Body() dto: CreateScheduledTransactionDto, @CurrentUser() user: { id: string }) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all scheduled transactions for current user' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.service.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.service.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduledTransactionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Patch(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.service.pause(id, user.id);
  }

  @Patch(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.service.resume(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.service.remove(id, user.id);
  }
}

@ApiTags('Admin - Scheduled Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/scheduled-transactions')
export class AdminScheduledTransactionController {
  constructor(private readonly service: ScheduledTransactionService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list all scheduled transactions with execution history' })
  findAll() {
    return this.service.findAllAdmin();
  }
}
