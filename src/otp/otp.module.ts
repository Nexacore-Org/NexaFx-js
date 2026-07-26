import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Otp } from './otp.entity';
import { OtpService } from './otp.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Otp]), MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
