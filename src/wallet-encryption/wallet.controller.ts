import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';

import { WalletService } from './services/wallet.service';
import { KeyRotationJob } from './jobs/key-rotation.job';
import { CreateWalletDto, UpdateWalletPrivateKeyDto } from './dto/create-wallet.dto';
import { WalletResponseDto } from './dto/wallet-response.dto';

class RotateKeysDto {
  oldKeyHex: string;
  targetVersion: number;
}

/**
 * ClassSerializerInterceptor enforces WalletResponseDto's @Exclude() decorator
 * at the HTTP layer — privateKeyEncrypted is stripped from every response
 * even if a developer accidentally returns a raw Wallet entity.
 */
@UseInterceptors(ClassSerializerInterceptor)
@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly keyRotationJob: KeyRotationJob,
  ) {}

  @Post()
  async create(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    return this.walletService.create(dto);
  }

  @Get()
  async findAll(): Promise<WalletResponseDto[]> {
    return this.walletService.findAll();
  }

  /** GET /wallets/:id — privateKey is NEVER included */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletResponseDto> {
    return this.walletService.findById(id);
  }

  @Patch(':id/private-key')
  async updatePrivateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletPrivateKeyDto,
  ): Promise<WalletResponseDto> {
    return this.walletService.updatePrivateKey(id, dto);
  }

  /**
   * POST /wallets/admin/rotate-keys
   * Admin-only endpoint — should be protected by an AdminGuard in production.
   */
  @Post('admin/rotate-keys')
  @HttpCode(HttpStatus.OK)
  async rotateKeys(@Body() dto: RotateKeysDto) {
    return this.keyRotationJob.rotate(dto.oldKeyHex, dto.targetVersion);
  }
}
