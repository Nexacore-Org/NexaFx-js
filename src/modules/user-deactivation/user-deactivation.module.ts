import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDeactivationEntity } from './entities/user-deactivation.entity';
import { UserDeactivationService } from './services/user-deactivation.service';
import { UserDeactivationController } from './controllers/user-deactivation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserDeactivationEntity]),
  ],
  controllers: [UserDeactivationController],
  providers: [UserDeactivationService],
  exports: [UserDeactivationService],
})
export class UserDeactivationModule {}
