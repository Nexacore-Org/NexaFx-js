import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlAlert } from './aml-alert.entity';
import { AmlScreening } from './aml-screening.entity';
import { AmlService } from './aml.service';
import { AmlScreeningService } from './aml-screening.service';
import { AmlController } from './aml.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AmlAlert, AmlScreening])],
  controllers: [AmlController],
  providers: [AmlService, AmlScreeningService],
  exports: [AmlService, AmlScreeningService],
})
export class AmlModule {}
