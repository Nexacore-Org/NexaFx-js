import { Module, type NestModule, type MiddlewareConsumer } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { PayloadSanitizerMiddleware } from "./payload-sanitizer.middleware"
import { PayloadSanitizerService } from "./payload-sanitizer.service"
import { PayloadSanitizerController } from "./payload-sanitizer.controller"

@Module({
  imports: [ConfigModule],
  providers: [PayloadSanitizerMiddleware, PayloadSanitizerService],
  controllers: [PayloadSanitizerController],
  exports: [PayloadSanitizerMiddleware, PayloadSanitizerService],
})
export class PayloadSanitizerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PayloadSanitizerMiddleware).forRoutes("*")
  }
}
