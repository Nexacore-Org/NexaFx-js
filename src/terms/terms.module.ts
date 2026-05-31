import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsAcceptance } from './terms-acceptance.entity';
import { TermsAcceptanceService } from './terms-acceptance.service';
import { TermsController } from './terms.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TermsAcceptance]),
    forwardRef(() => AuthModule),
  ],
  providers: [TermsAcceptanceService],
  controllers: [TermsController],
  exports: [TermsAcceptanceService],
})
export class TermsModule {}
