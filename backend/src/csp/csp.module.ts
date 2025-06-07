import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { CspMiddleware } from "./csp.middleware"
import { CspService } from "./csp.service"
import { CspController } from "./csp.controller"

@Module({
  imports: [ConfigModule],
  providers: [CspService],
  controllers: [CspController],
  exports: [CspService],
})
export class CspModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CspMiddleware).forRoutes("*")
  }
}
