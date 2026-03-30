import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import {
  ForwardContractService,
  EXCHANGE_RATE_PROVIDER,
  IExchangeRateProvider,
} from '../services/forward-contract.service';
import {
  CancelForwardContractDto,
  CreateForwardContractDto,
} from '../dto/forward-contract.dto';
import { ForwardContract } from '../entities/forward-contract.entity';
import { ExposureService, CurrencyPairExposure } from '../../risk-engine/exposure.service';

// ─── Auth guard placeholder ───────────────────────────────────────────────────
// Replace with your real JwtAuthGuard import once available in this module scope
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

// Helper: extract authenticated user id from request
function getUserId(req: Request): string {
  return (req as any).user?.sub ?? (req as any).user?.id;
}

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('FX Forwards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('fx/forwards')
export class ForwardContractController {
  constructor(
    private readonly forwardService: ForwardContractService,
    private readonly exposureService: ExposureService,
    @Inject(EXCHANGE_RATE_PROVIDER)
    private readonly rateProvider: IExchangeRateProvider,
  ) {}

  // ─── POST /fx/forwards ─────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book an FX forward contract',
    description:
      'Locks the current spot rate for future settlement. ' +
      'Collateral is blocked immediately and released only at settlement or cancellation.',
  })
  @ApiResponse({ status: 201, description: 'Contract created with status ACTIVE.' })
  @ApiResponse({ status: 400, description: 'Invalid input or insufficient collateral.' })
  async bookForward(
    @Req() req: Request,
    @Body() dto: CreateForwardContractDto,
  ): Promise<ForwardContract> {
    const userId = getUserId(req);
    return this.forwardService.bookForward(userId, dto, this.rateProvider);
  }

  // ─── GET /fx/forwards ──────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all forward contracts for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Array of forward contracts.' })
  async findAll(@Req() req: Request): Promise<ForwardContract[]> {
    return this.forwardService.findAll(getUserId(req));
  }

  // ─── GET /fx/forwards/:id ──────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single forward contract by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The requested forward contract.' })
  @ApiResponse({ status: 404, description: 'Contract not found.' })
  async findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ForwardContract> {
    return this.forwardService.findOne(id, getUserId(req));
  }

  // ─── DELETE /fx/forwards/:id ───────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a forward contract early',
    description:
      `A configurable cancellation fee (env FORWARD_CANCELLATION_FEE_RATE, default 2%) ` +
      `is charged on the notional × locked rate. Remaining collateral is released.`,
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contract cancelled.' })
  @ApiResponse({ status: 400, description: 'Contract is not ACTIVE.' })
  async cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelForwardContractDto,
  ): Promise<ForwardContract> {
    return this.forwardService.cancelContract(id, getUserId(req), dto);
  }

  // ─── GET /fx/forwards/exposure ─────────────────────────────────────────────

  @Get('exposure/all')
  @ApiOperation({
    summary: 'Get aggregate forward exposure across all currency pairs',
    description:
      'Returns the total notional exposure tracked by the risk engine. ' +
      'A WARN-level alert is emitted when any pair exceeds RISK_THRESHOLD.',
  })
  @ApiResponse({ status: 200, description: 'Array of per-pair exposure snapshots.' })
  getExposures(): CurrencyPairExposure[] {
    return this.exposureService.getAllExposures();
  }
}
