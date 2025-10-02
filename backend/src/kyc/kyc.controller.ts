import { Controller, Post, Get, Patch, Body, Param, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KycService } from './services/kyc.service';
import { DocumentType } from './entities/kyc-document.entity';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { AdminReviewDto } from './dto/admin-review.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit/:userId')
  submitKyc(@Param('userId') userId: string, @Body() submitDto: SubmitKycDto) {
    return this.kycService.submitKyc(userId, submitDto);
  }
  
  @Get('status/:userId')
  getKycStatus(@Param('userId') userId: string) {
    return this.kycService.getKycStatus(userId);
  }
  
  @Post('documents/upload/:userId/:type')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('userId') userId: string,
    @Param('type') type: DocumentType,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|pdf)' }),
        ],
      }),
    ) file: Express.Multer.File,
  ) {
    return this.kycService.uploadDocument(userId, type, file);
  }
  
  // ADMIN ENDPOINT
  @Post('admin/review/:userId')
  reviewSubmission(@Param('userId') userId: string, @Body() reviewDto: AdminReviewDto) {
      return this.kycService.reviewSubmission(userId, reviewDto.approve, reviewDto.rejectionReason);
  }
}