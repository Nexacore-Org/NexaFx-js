import { Injectable, UnauthorizedException } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import type { ConfigService } from "@nestjs/config"
import type { Request } from "express"

// Mock user repository - replace with your actual user repository
class UserRepository {
  async findById(id: string): Promise<any> {
    // Mock implementation
    return { id, email: `user-${id}@example.com` }
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private userRepository = new UserRepository()

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.jwt
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
    })
  }

  async validate(payload: any) {
    const user = await this.userRepository.findById(payload.sub)

    if (!user) {
      throw new UnauthorizedException("User not found")
    }

    return user
  }
}
