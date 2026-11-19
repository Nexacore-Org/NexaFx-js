import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { TokensModule } from '../../tokens/tokens.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [TokensModule, AuditModule],
  controllers: [SessionsController],
})
export class SessionsModule {}
