import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { KycService, SubmitKycDto, ReviewKycDto } from './kyc.service';

@Controller('api/v1/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(@Body() dto: SubmitKycDto) {
    return this.kycService.submit(dto);
  }

  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewKycDto) {
    return this.kycService.review(id, dto);
  }
}
