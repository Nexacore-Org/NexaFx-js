import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlAlert } from './aml-alert.entity';
import { AmlService } from './aml.service';

@Module({
  imports: [TypeOrmModule.forFeature([AmlAlert])],
  providers: [AmlService],
  exports: [AmlService],
})
export class AmlModule {}
