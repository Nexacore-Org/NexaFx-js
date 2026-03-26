import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { SanctionsService } from '../../compliance/services/sanctions.service';

@Injectable()
export class SanctionsScreenGuard implements CanActivate {
  constructor(private sanctionsService: SanctionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { senderAddress, recipientAddress, entityName } = request.body;

    const targets = [senderAddress, recipientAddress, entityName].filter(Boolean);

    for (const target of targets) {
      if (await this.sanctionsService.isSanctioned(target)) {
        await this.sanctionsService.handleSanctionsMatch(target, request.url);
        return false; 
      }
    }
    return true;
  }
}