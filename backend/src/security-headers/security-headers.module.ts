import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { SecurityHeadersMiddleware } from "./security-headers.middleware"
import { SecurityHeadersService } from "./security-headers.service"
import { SecurityHeadersController } from "./security-headers.controller"

@Module({
  imports: [ConfigModule],
  providers: [SecurityHeadersMiddleware, SecurityHeadersService],
  controllers: [SecurityHeadersController],
  exports: [SecurityHeadersMiddleware, SecurityHeadersService],
})
export class SecurityHeadersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply security headers middleware to all routes
    consumer.apply(SecurityHeadersMiddleware).forRoutes("*")
  }
}
