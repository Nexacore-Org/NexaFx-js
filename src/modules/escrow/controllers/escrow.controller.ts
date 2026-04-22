import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { Idempotent } from '../../../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { EscrowService } from '../services/escrow.service';
import { CreateEscrowDto } from '../dto/create-escrow.dto';
import { ReleaseEscrowDto } from '../dto/release-escrow.dto';
import { DisputeEscrowDto } from '../dto/dispute-escrow.dto';
import { CancelEscrowDto } from '../dto/cancel-escrow.dto';

@ApiTags('Escrow')
@ApiBearerAuth('access-token')
@Controller('escrow')
@UseGuards(JwtAuthGuard)
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  @Post()
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create an escrow transaction' })
  @ApiCreatedResponse({ description: 'Escrow created successfully' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate escrow creation (min 16 chars)', required: true })
  async create(@Request() req: any, @Body() dto: CreateEscrowDto) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.createEscrow(userId, dto);

    return {
      success: true,
      data: escrow,
    };
  }

  @Post(':id/release')
  @ApiOperation({ summary: 'Release an escrow transaction' })
  @ApiParam({ name: 'id', description: 'Escrow UUID' })
  @ApiOkResponse({ description: 'Escrow released' })
  async release(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
    @Body() dto: ReleaseEscrowDto,
  ) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.releaseEscrow(id, userId, dto.note);

    return {
      success: true,
      data: escrow,
    };
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Raise a dispute on an escrow transaction' })
  @ApiParam({ name: 'id', description: 'Escrow UUID' })
  @ApiOkResponse({ description: 'Dispute raised' })
  async dispute(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
    @Body() dto: DisputeEscrowDto,
  ) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.disputeEscrow(id, userId, dto.reason, dto.metadata);

    return {
      success: true,
      data: escrow,
    };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an escrow transaction' })
  @ApiParam({ name: 'id', description: 'Escrow UUID' })
  @ApiOkResponse({ description: 'Escrow cancelled' })
  async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
    @Body() dto: CancelEscrowDto,
  ) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.cancelEscrow(id, userId, dto.reason);

    return {
      success: true,
      data: escrow,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get escrow by ID' })
  @ApiParam({ name: 'id', description: 'Escrow UUID' })
  @ApiOkResponse({ description: 'Escrow record' })
  async getById(@Param('id', new ParseUUIDPipe()) id: string) {
    const escrow = await this.escrowService.findById(id);

    return {
      success: true,
      data: escrow,
    };
  }

  @Get()
  @ApiOperation({ summary: "Get current user's escrows (active and completed) with pagination" })
  async list(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const userId = this.getUserId(req);
    return this.escrowService.findByUser(userId, parseInt(page, 10) || 1, parseInt(limit, 10) || 20);
  }

  @Post(':id/fulfill-condition')
  @ApiOperation({ summary: 'Fulfill a multi-party release condition for an escrow' })
  @ApiParam({ name: 'id', description: 'Escrow UUID' })
  async fulfillCondition(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: any) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.fulfillCondition(id, userId);
    return { success: true, data: escrow };
  }

  private getUserId(req: any): string {
    const userId = req.user?.id ?? req.user?.sub ?? req.headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException('User ID could not be determined from request');
    }

    return userId;
  }
}
