import { Injectable } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { Strategy, type VerifyCallback } from "passport-google-oauth20"
import type { ConfigService } from "@nestjs/config"

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>("GOOGLE_CLIENT_ID"),
      clientSecret: configService.get<string>("GOOGLE_CLIENT_SECRET"),
      callbackURL: configService.get<string>("GOOGLE_CALLBACK_URL") || "http://localhost:3000/auth/google/callback",
      scope: ["email", "profile"],
    })
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { id, name, emails, photos } = profile

    const user = {
      id,
      email: emails?.[0]?.value,
      firstName: name?.givenName,
      lastName: name?.familyName,
      picture: photos?.[0]?.value,
      accessToken,
    }

    done(null, user)
  }
}
