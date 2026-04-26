// Stub file - will be created
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true; // Stub implementation
  }
}
