// Starting skeleton for a dedicated cache-management module (issue
// #1268), distinct from the app-level `@nestjs/cache-manager`
// CacheModule already registered in app.module.ts. NOTE:
// src/app.module.ts does not currently import anything from
// src/modules/cache/ -- the issue's premise that it does and fails to
// compile does not match the current main branch.
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  controllers: [],
  exports: [],
})
export class ModulesCacheModule {}
