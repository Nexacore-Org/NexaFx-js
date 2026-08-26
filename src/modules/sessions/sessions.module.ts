import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { TokensModule } from '../../tokens/tokens.module';

@Module({
  imports: [TokensModule],
  controllers: [SessionsController],
})
export class SessionsModule {}
