import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { I18nService } from "./i18n.service";

declare global {
  namespace Express {
    interface Request {
      language?: string;
    }
  }
}

@Injectable()
export class I18nMiddleware implements NestMiddleware {
  constructor(private readonly i18nService: I18nService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const acceptLanguage = req.headers["accept-language"];
    req.language = this.i18nService.parseAcceptLanguage(acceptLanguage);
    next();
  }
}
