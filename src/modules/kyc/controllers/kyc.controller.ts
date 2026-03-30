import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsObject } from 'class-validator';
import { KycService } from '../services/kyc.service';
import { KycDocType } from '../entities/kyc-document.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

class SubmitKycDto {
  @IsEnum(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'UTILITY_BILL'])
  docType: KycDocType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  submit(@Request() req: any, @Body(ValidationPipe) dto: SubmitKycDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.kycService.submit(userId, dto.docType, dto.metadata);
  }

  @Get('status')
  getStatus(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.kycService.getStatus(userId);
  }
}
