import { Module, Global } from "@nestjs/common";
import { I18nService } from "./i18n.service";
import { I18nMiddleware } from "./i18n.middleware";

@Global()
@Module({
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
