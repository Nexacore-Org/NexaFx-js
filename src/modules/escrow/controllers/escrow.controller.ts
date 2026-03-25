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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { EscrowService } from '../services/escrow.service';
import { CreateEscrowDto } from '../dto/create-escrow.dto';
import { ReleaseEscrowDto } from '../dto/release-escrow.dto';
import { DisputeEscrowDto } from '../dto/dispute-escrow.dto';
import { CancelEscrowDto } from '../dto/cancel-escrow.dto';

@Controller('escrow')
@UseGuards(JwtAuthGuard)
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateEscrowDto) {
    const userId = this.getUserId(req);
    const escrow = await this.escrowService.createEscrow(userId, dto);

    return {
      success: true,
      data: escrow,
    };
  }

  @Post(':id/release')
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
  async getById(@Param('id', new ParseUUIDPipe()) id: string) {
    const escrow = await this.escrowService.findById(id);

    return {
      success: true,
      data: escrow,
    };
  }

  private getUserId(req: any): string {
    const userId = req.user?.id ?? req.user?.sub ?? req.headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException('User ID could not be determined from request');
    }

    return userId;
  }
}
