import { Injectable } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { Strategy } from "passport-facebook"
import type { ConfigService } from "@nestjs/config"

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, "facebook") {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>("FACEBOOK_APP_ID"),
      clientSecret: configService.get<string>("FACEBOOK_APP_SECRET"),
      callbackURL: configService.get<string>("FACEBOOK_CALLBACK_URL") || "http://localhost:3000/auth/facebook/callback",
      scope: ["email", "public_profile"],
      profileFields: ["id", "emails", "name", "displayName"],
    })
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: Function): Promise<any> {
    const { id, name, emails } = profile

    const user = {
      id,
      email: emails?.[0]?.value,
      firstName: name?.givenName,
      lastName: name?.familyName,
      accessToken,
    }

    done(null, user)
  }
}
