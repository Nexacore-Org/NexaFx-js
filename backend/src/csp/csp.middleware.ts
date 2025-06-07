import { Injectable, type NestMiddleware, Logger } from "@nestjs/common"
import type { Request, Response, NextFunction } from "express"
import * as helmet from "helmet"
import type { CspService } from "./csp.service"

@Injectable()
export class CspMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CspMiddleware.name)

  constructor(private readonly cspService: CspService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Get CSP configuration based on environment and route
    const cspConfig = this.cspService.getCspConfig(req)

    // Apply Helmet with CSP configuration
    const helmetMiddleware = helmet({
      contentSecurityPolicy: {
        directives: cspConfig.directives,
        reportOnly: cspConfig.reportOnly,
        useDefaults: false, // We'll define our own defaults
      },
      // Additional security headers
      crossOriginEmbedderPolicy: false, // Disable if causing issues with third-party embeds
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: "deny" },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: "no-referrer" },
      xssFilter: true,
    })

    // Log CSP configuration in development
    if (process.env.NODE_ENV === "development") {
      this.logger.debug(`CSP applied for ${req.method} ${req.path}`, {
        directives: cspConfig.directives,
        reportOnly: cspConfig.reportOnly,
      })
    }

    helmetMiddleware(req, res, next)
  }
}
