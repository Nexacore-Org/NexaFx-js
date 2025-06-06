import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ChecklistService } from "./checklist.service"
import { ChecklistController } from "./checklist.controller"
import { SecurityCheck } from "./entities/security-check.entity"

@Module({
  imports: [TypeOrmModule.forFeature([SecurityCheck])],
  controllers: [ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
