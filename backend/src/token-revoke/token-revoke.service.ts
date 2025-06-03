import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RevokedToken } from './revoked-token.schema';

@Injectable()
export class TokenRevokeService {
  constructor(
    @InjectModel(RevokedToken.name) 
    private readonly revokedTokenModel: Model<RevokedToken>,
  ) {}

  async revokeToken(token: string, expirationDate: Date): Promise<void> {
    const revokedToken = new this.revokedTokenModel({
      token,
      expiresAt: expirationDate,
    });
    await revokedToken.save();
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    const revokedToken = await this.revokedTokenModel.findOne({ token }).exec();
    return !!revokedToken;
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.revokedTokenModel.deleteMany({
      expiresAt: { $lt: new Date() },
    }).exec();
  }
}