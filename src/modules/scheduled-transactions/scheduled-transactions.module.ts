// Starting skeleton for recurring/scheduled transaction execution
// (issue #1266). NOTE: src/app.module.ts does not currently import
// anything from src/modules/scheduled-transactions/ -- the issue's
// premise that it does and fails to compile does not match the current
// main branch. This is foundational scaffolding, not a fix for an
// active compile error, and is not yet registered in app.module.ts.
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  controllers: [],
  exports: [],
})
export class ScheduledTransactionsModule {}
