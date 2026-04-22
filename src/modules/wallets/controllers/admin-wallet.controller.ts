import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, Length, IsInt, Min } from 'class-validator';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { WalletKeyEncryptionService } from '../services/wallet-key-encryption.service';

class KeyRotationDto {
  @IsNotEmpty() @IsString() @Length(64, 64) oldKeyHex: string;
  @IsInt() @Min(2) targetVersion: number;
}

@Controller('admin/wallets')
@UseGuards(AdminGuard)
export class AdminWalletController {
  constructor(private readonly encryptionService: WalletKeyEncryptionService) {}

  /** POST /admin/wallets/rotate-keys */
  @Post('rotate-keys')
  @HttpCode(HttpStatus.OK)
  rotateKeys(@Body() dto: KeyRotationDto) {
    return this.encryptionService.rotateKeys(dto.oldKeyHex, dto.targetVersion);
  }
}
