import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Session } from '../entities/session.entity';
import { CreateSessionDto } from '../dto/session.dto';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private jwtService: JwtService,
  ) {}

  async createSession(createSessionDto: CreateSessionDto): Promise<Session> {
    // Remove any existing sessions for the user if needed (optional)
    await this.invalidateUserSessions(createSessionDto.userId);

    const session = this.sessionRepository.create(createSessionDto);
    return await this.sessionRepository.save(session);
  }

  async findSessionByToken(token: string): Promise<Session | null> {
    return await this.sessionRepository.findOne({
      where: { 
        token,
        isBlacklisted: false,
        expiresAt: LessThan(new Date())
      }
    });
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const session = await this.sessionRepository.findOne({
      where: { token }
    });
    
    return session ? session.isBlacklisted : false;
  }

  async blacklistToken(token: string): Promise<void> {
    await this.sessionRepository.update(
      { token },
      { isBlacklisted: true }
    );
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.update(
      { userId, isBlacklisted: false },
      { isBlacklisted: true }
    );
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.sessionRepository.delete({
      expiresAt: LessThan(new Date())
    });
  }

  async login(username: string, password: string): Promise<{ accessToken: string, user: any }> {
    // Mock user validation - replace with your actual user service
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username };
    const accessToken = this.jwtService.sign(payload);
    
    // Save session with metadata
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

    await this.createSession({
      userId: user.id,
      token: accessToken,
      metadata: {
        userAgent: 'browser-info', // You can pass this from request
        ipAddress: '127.0.0.1',   // You can pass this from request
        loginTime: new Date()
      },
      expiresAt
    });

    return {
      accessToken,
      user: { id: user.id, username: user.username }
    };
  }

  async logout(token: string): Promise<void> {
    await this.blacklistToken(token);
  }

  private async validateUser(username: string, password: string): Promise<any> {
    // Mock implementation - replace with your actual user validation
    // This should check against your user database and verify password hash
    if (username === 'testuser' && password === 'testpass') {
      return { id: '1', username: 'testuser' };
    }
    return null;
  }
}