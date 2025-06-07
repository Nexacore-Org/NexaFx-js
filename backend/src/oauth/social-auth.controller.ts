import { Controller, Get, Req, Res, UseGuards, HttpStatus, Post, Body, UnauthorizedException } from "@nestjs/common"
import { AuthGuard } from "@nestjs/passport"
import type { Response } from "express"
import type { SocialAuthService } from "./social-auth.service"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"

@Controller("auth")
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // This route initiates the Google OAuth2 flow
    // The guard will handle the redirection
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    try {
      const { accessToken, user } = await this.socialAuthService.validateOAuthLogin(req.user, "google")

      // Set JWT as HTTP-only cookie
      res.cookie("jwt", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })

      // Redirect to frontend application
      return res.redirect(process.env.FRONTEND_URL || "http://localhost:3000/auth/success")
    } catch (error) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/failure?error=${error.message}`)
    }
  }

  @Get("facebook")
  @UseGuards(AuthGuard("facebook"))
  facebookAuth() {
    // This route initiates the Facebook OAuth2 flow
    // The guard will handle the redirection
  }

  @Get("facebook/callback")
  @UseGuards(AuthGuard("facebook"))
  async facebookAuthCallback(@Req() req, @Res() res: Response) {
    try {
      const { accessToken, user } = await this.socialAuthService.validateOAuthLogin(req.user, "facebook")

      // Set JWT as HTTP-only cookie
      res.cookie("jwt", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })

      // Redirect to frontend application
      return res.redirect(process.env.FRONTEND_URL || "http://localhost:3000/auth/success")
    } catch (error) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/failure?error=${error.message}`)
    }
  }

  @Post("link-account")
  @UseGuards(JwtAuthGuard)
  async linkSocialAccount(@Req() req, @Body() body: { provider: string; token: string }) {
    try {
      const result = await this.socialAuthService.linkSocialAccount(req.user.id, body.provider, body.token)
      return { success: true, data: result }
    } catch (error) {
      throw new UnauthorizedException(error.message)
    }
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  getProfile(req) {
    return req.user
  }

  @Post("logout")
  logout(res: Response) {
    res.clearCookie("jwt")
    return res.status(HttpStatus.OK).json({ message: "Logged out successfully" })
  }
}
