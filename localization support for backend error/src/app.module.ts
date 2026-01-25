import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { I18nModule } from "./i18n/i18n.module";
import { I18nMiddleware } from "./i18n/i18n.middleware";
import { LocalizedExceptionFilter } from "./common/exceptions/localized-exception.filter";

@Module({
  imports: [I18nModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: LocalizedExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(I18nMiddleware).forRoutes("*");
  }
}
