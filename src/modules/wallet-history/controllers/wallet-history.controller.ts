import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { WalletHistoryService } from '../services/wallet-history.service';
import { QueryWalletHistoryDto } from '../dto/query-wallet-history.dto';

@ApiTags('Wallet History')
@ApiBearerAuth('access-token')
@Controller('wallet/history')
@UseGuards(JwtAuthGuard)
export class WalletHistoryController {
  constructor(private readonly walletHistoryService: WalletHistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance history' })
  @ApiOkResponse({ description: 'Paginated list of wallet balance snapshots' })
  async getHistory(@Request() req: any, @Query(ValidationPipe) dto: QueryWalletHistoryDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.walletHistoryService.getHistory(userId, dto);
  }

  @Post('snapshot')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a wallet balance snapshot' })
  @ApiCreatedResponse({ description: 'Snapshot recorded' })
  async recordSnapshot(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.walletHistoryService.recordSnapshot(userId);
  }
}
