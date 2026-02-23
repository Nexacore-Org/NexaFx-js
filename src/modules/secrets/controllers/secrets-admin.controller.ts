import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { SecretsService } from '../services/secrets.service';
import { RotateSecretDto } from '../dto/rotate-secret.dto';
import { SecretType } from '../entities/secret.entity';

@Controller('admin/secrets')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SecretsAdminController {
  constructor(private readonly secretsService: SecretsService) {}

  @Post('rotate')
  rotate(@Body() dto: RotateSecretDto) {
    return this.secretsService.rotateSecret(dto);
  }

  @Get(':type/history')
  history(@Param('type') type: SecretType) {
    return this.secretsService.getRotationHistory(type);
  }
}
