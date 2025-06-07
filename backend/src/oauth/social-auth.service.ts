import { Injectable, UnauthorizedException, InternalServerErrorException } from "@nestjs/common"
import type { JwtService } from "@nestjs/jwt"
import type { ConfigService } from "@nestjs/config"

// This would typically be imported from your user module
interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  socialProfiles?: {
    provider: string
    id: string
    email?: string
    displayName?: string
    accessToken?: string
  }[]
}

// Mock user repository - replace with your actual user repository
class UserRepository {
  private users: User[] = []

  async findBySocialId(provider: string, id: string): Promise<User | undefined> {
    return this.users.find((user) =>
      user.socialProfiles?.some((profile) => profile.provider === provider && profile.id === id),
    )
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email)
  }

  async findById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id)
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 15),
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      socialProfiles: userData.socialProfiles || [],
    }
    this.users.push(newUser)
    return newUser
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const userIndex = this.users.findIndex((user) => user.id === id)
    if (userIndex === -1) {
      throw new Error("User not found")
    }

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...userData,
    }

    return this.users[userIndex]
  }
}

@Injectable()
export class SocialAuthService {
  private userRepository = new UserRepository()

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateOAuthLogin(profile: any, provider: string) {
    try {
      if (!profile) {
        throw new UnauthorizedException("No profile returned from OAuth provider")
      }

      // Extract profile information based on provider
      const socialProfile = this.extractSocialProfile(profile, provider)

      // Find existing user by social ID or email
      let user = await this.userRepository.findBySocialId(provider, socialProfile.id)

      if (!user && socialProfile.email) {
        // If no user found by social ID, try to find by email
        user = await this.userRepository.findByEmail(socialProfile.email)

        if (user) {
          // If user exists with this email, link the social profile
          if (!user.socialProfiles) {
            user.socialProfiles = []
          }

          user.socialProfiles.push({
            provider,
            id: socialProfile.id,
            email: socialProfile.email,
            displayName: socialProfile.displayName,
          })

          user = await this.userRepository.update(user.id, {
            socialProfiles: user.socialProfiles,
          })
        }
      }

      // If no user found, create a new one
      if (!user) {
        user = await this.userRepository.create({
          email: socialProfile.email,
          firstName: socialProfile.firstName,
          lastName: socialProfile.lastName,
          socialProfiles: [
            {
              provider,
              id: socialProfile.id,
              email: socialProfile.email,
              displayName: socialProfile.displayName,
            },
          ],
        })
      }

      // Generate JWT token
      const payload = {
        sub: user.id,
        email: user.email,
      }

      const accessToken = this.jwtService.sign(payload)

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      }
    } catch (error) {
      throw new InternalServerErrorException(`Failed to authenticate: ${error.message}`)
    }
  }

  async linkSocialAccount(userId: string, provider: string, token: string) {
    // This would typically involve:
    // 1. Verifying the token with the provider
    // 2. Getting the user profile from the provider
    // 3. Linking the social profile to the user account

    // For demonstration purposes, we'll just mock this
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new UnauthorizedException("User not found")
    }

    // Mock social profile data that would come from verifying the token
    const mockSocialProfile = {
      id: `mock-${provider}-id-${Math.random().toString(36).substring(2, 7)}`,
      email: `mock-${provider}-${Math.random().toString(36).substring(2, 7)}@example.com`,
      displayName: `Mock ${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
    }

    if (!user.socialProfiles) {
      user.socialProfiles = []
    }

    // Check if this provider is already linked
    const existingProfileIndex = user.socialProfiles.findIndex((profile) => profile.provider === provider)

    if (existingProfileIndex >= 0) {
      // Update existing profile
      user.socialProfiles[existingProfileIndex] = {
        ...user.socialProfiles[existingProfileIndex],
        ...mockSocialProfile,
        accessToken: token,
      }
    } else {
      // Add new profile
      user.socialProfiles.push({
        provider,
        ...mockSocialProfile,
        accessToken: token,
      })
    }

    await this.userRepository.update(user.id, {
      socialProfiles: user.socialProfiles,
    })

    return {
      message: `Successfully linked ${provider} account`,
      provider,
    }
  }

  private extractSocialProfile(profile: any, provider: string) {
    switch (provider) {
      case "google":
        return {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          displayName: profile.displayName,
        }
      case "facebook":
        return {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          displayName: profile.displayName,
        }
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
}
