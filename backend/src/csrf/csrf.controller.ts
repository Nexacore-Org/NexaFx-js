import { Controller, Get, Post, UseGuards } from "@nestjs/common"
import type { Request } from "express"
import type { CsrfService } from "./csrf.service"
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard"

interface CsrfRequest extends Request {
  csrfToken?: string
  session?: {
    csrfSecret?: string
    [key: string]: any
  }
}

@Controller("security/csrf")
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Get CSRF token for AJAX requests
   */
  @Get("token")
  getCsrfToken(req: CsrfRequest) {
    if (!req.session?.csrfSecret) {
      // Generate new secret if not exists
      req.session = req.session || {}
      req.session.csrfSecret = this.csrfService.generateSecret()
    }

    const token = this.csrfService.generateToken(req.session.csrfSecret)

    return {
      success: true,
      data: {
        token,
        headerName: "X-CSRF-Token",
        cookieName: "XSRF-TOKEN",
      },
      message: "CSRF token generated successfully",
    }
  }

  /**
   * Get CSRF protection status
   */
  @Get("status")
  getCsrfStatus(req: CsrfRequest) {
    return {
      success: true,
      data: {
        protected: true,
        hasSecret: !!req.session?.csrfSecret,
        hasToken: !!req.csrfToken,
        methods: {
          header: "X-CSRF-Token",
          cookie: "XSRF-TOKEN",
          formField: "_csrf",
          queryParam: "_csrf",
        },
      },
    }
  }

  /**
   * Get CSRF statistics (admin only)
   */
  @Get("stats")
  @UseGuards(JwtAuthGuard)
  getCsrfStats() {
    const stats = this.csrfService.getStats()
    return {
      success: true,
      data: stats,
    }
  }

  /**
   * Clear CSRF statistics (admin only)
   */
  @Post("stats/clear")
  @UseGuards(JwtAuthGuard)
  clearCsrfStats() {
    this.csrfService.clearStats()
    return {
      success: true,
      message: "CSRF statistics cleared",
    }
  }

  /**
   * Test CSRF protection (for testing purposes)
   */
  @Post("test")
  testCsrfProtection() {
    return {
      success: true,
      message: "CSRF protection is working - this request was allowed",
    }
  }
}
