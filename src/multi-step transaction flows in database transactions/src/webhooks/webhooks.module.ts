import { Module } from "@nestjs/common";
import { WebhookDispatchService } from "./services/webhook-dispatch.service";

@Module({
  providers: [WebhookDispatchService],
  exports: [WebhookDispatchService],
})
export class WebhooksModule {}
