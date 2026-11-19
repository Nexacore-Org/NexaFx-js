import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../../common/guards/ip-allowlist.guard';
import { KeyRotationService } from '../../../admin/key-rotation.service';
import { AuditService } from '../../../audit/audit.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FundWalletDto } from '../dto/fund-wallet.dto';

@Controller('admin')
export class SystemAdminController {
  private readonly logger = new Logger(SystemAdminController.name);

  constructor(
    private readonly keyRotation: KeyRotationService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly audit: AuditService,
  ) {}

  /** #807 — Rotate wallet encryption key: re-encrypt all wallets to current key version */
  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post('system/rotate-encryption-key')
  @HttpCode(HttpStatus.OK)
  async rotateEncryptionKey(@CurrentUser('id') adminId: string) {
    const result = await this.keyRotation.rotate();
    // Key management leaves a record of who triggered it and what it touched (issue #1521).
    await this.audit.log({
      userId: adminId,
      action: 'admin.system.rotate_encryption_key',
      entityType: 'system',
      after: { total: result.total, rotated: result.rotated, skipped: result.skipped },
    });
    return { message: 'Key rotation complete', ...result };
  }

  /** #813 — Fund a Stellar testnet wallet via Friendbot. TESTNET + non-production only. */
  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Post('dev/fund-wallet')
  @HttpCode(HttpStatus.OK)
  async fundWallet(@Body() dto: FundWalletDto, @CurrentUser('id') adminId: string) {
    const network = this.config.get<string>('STELLAR_NETWORK') ?? process.env.STELLAR_NETWORK;
    const nodeEnv = this.config.get<string>('app.env') ?? process.env.NODE_ENV;

    // Outside TESTNET non-production this route does not exist as far as callers can tell
    // (404, not a 403 that confirms a dev tool is there).
    if (network?.toUpperCase() !== 'TESTNET' || nodeEnv === 'production') {
      throw new NotFoundException();
    }

    const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(dto.address)}`;
    const response = await firstValueFrom(this.http.get(url));
    this.logger.log(`Friendbot funded ${dto.address}`);
    await this.audit.log({
      userId: adminId,
      action: 'admin.system.fund_wallet',
      entityType: 'wallet',
      entityId: dto.address,
      after: { address: dto.address, network: 'TESTNET' },
    });
    return { funded: true, address: dto.address, hash: (response.data as { hash?: string }).hash };
  }
}
