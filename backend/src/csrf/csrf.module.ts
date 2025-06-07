import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { CsrfMiddleware } from "./csrf.middleware"
import { CsrfService } from "./csrf.service"
import { CsrfController } from "./csrf.controller"

@Module({
  imports: [ConfigModule],
  providers: [CsrfService],
  controllers: [CsrfController],
  exports: [CsrfService],
})
export class CsrfModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes("*")
  }
}
