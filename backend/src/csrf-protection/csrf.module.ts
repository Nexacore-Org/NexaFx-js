import { Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { CsrfController } from './csrf.controller';
import { ManualCsrfController } from './manual-csrf.controller';
import { CsrfGuard } from './csrf.guard';

@Module({
  controllers: [CsrfController, ManualCsrfController],
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}