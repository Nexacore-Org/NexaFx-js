import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { WebhookService } from "./webhook.service"
import { WebhookController } from "./webhook.controller"
import { WebhookLog } from "./entities/webhook-log.entity"

@Module({
  imports: [TypeOrmModule.forFeature([WebhookLog])],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
