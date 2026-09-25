// Starting skeleton for a second, distinct FX module (issue #1267).
// NOTE: src/app.module.ts imports FxModule from './fx/fx.module' (the
// existing, working src/fx tree), not from src/modules/fx/ -- the
// issue's premise that app.module.ts imports and fails to resolve a
// modules/fx FxModule does not match the current main branch.
// src/modules/fx/ already contains fx-preview.controller.ts, which has
// its own separate broken import (`../auth/guards/jwt-auth.guard`,
// which doesn't resolve either) -- left as-is, not wired in here, to
// avoid inheriting that unrelated bug into this scaffold.
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  controllers: [],
  exports: [],
})
export class FxModule {}
