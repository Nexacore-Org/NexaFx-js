import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { KeyRotationService } from '../key-rotation.service';

class FundWalletDto {
  address!: string;
}

@Controller('api/v1/admin')
export class SystemAdminController {
  private readonly logger = new Logger(SystemAdminController.name);

  constructor(
    private readonly keyRotation: KeyRotationService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  /** #807 — Rotate wallet encryption key: re-encrypt all wallets to current key version */
  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post('system/rotate-encryption-key')
  @HttpCode(HttpStatus.OK)
  async rotateEncryptionKey() {
    const result = await this.keyRotation.rotate();
    return { message: 'Key rotation complete', ...result };
  }

  /** #813 — Fund a Stellar testnet wallet via Friendbot. TESTNET + non-production only. */
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @Post('dev/fund-wallet')
  @HttpCode(HttpStatus.OK)
  async fundWallet(@Body() dto: FundWalletDto) {
    const network = this.config.get<string>('STELLAR_NETWORK') ?? process.env.STELLAR_NETWORK;
    const nodeEnv = this.config.get<string>('app.env') ?? process.env.NODE_ENV;

    if (network?.toUpperCase() !== 'TESTNET' || nodeEnv === 'production') {
      throw new ForbiddenException(
        'Friendbot is only available on STELLAR_NETWORK=TESTNET in non-production environments',
      );
    }

    const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(dto.address)}`;
    const response = await firstValueFrom(this.http.get(url));
    this.logger.log(`Friendbot funded ${dto.address}`);
    return { funded: true, address: dto.address, hash: (response.data as { hash?: string }).hash };
  }
}
