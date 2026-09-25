// Starting skeleton for escrow-held transaction support (issue #1271).
// NOTE: src/app.module.ts does not currently import anything from
// src/modules/escrow/ — the issue's premise that it does and fails to
// compile does not match the current main branch. This is provided as
// foundational scaffolding, not a fix for an active compile error, and
// is not yet registered in app.module.ts.
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  controllers: [],
  exports: [],
})
export class EscrowModule {}
