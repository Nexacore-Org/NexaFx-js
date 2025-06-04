import { Module } from '@nestjs/common';
import { EmailVerifyController } from './email-verify.controller';
import { EmailVerifyService } from './email-verify.service';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 3600000, // 1 hour in milliseconds
      limit: 3, // 3 requests per hour
    }]),
  ],
  controllers: [EmailVerifyController],
  providers: [EmailVerifyService],
})
export class EmailVerifyModule {}