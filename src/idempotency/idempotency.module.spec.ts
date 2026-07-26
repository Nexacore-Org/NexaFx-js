import { IdempotencyModule } from './idempotency.module';
import { ScheduleModule } from '@nestjs/schedule';

describe('IdempotencyModule', () => {
  it('is defined', () => {
    expect(IdempotencyModule).toBeDefined();
  });

  it('does not import ScheduleModule.forRoot() — must only live in AppModule', () => {
    const metadata = Reflect.getMetadata('imports', IdempotencyModule) as unknown[] | undefined;
    const imports = metadata ?? [];
    const hasScheduleForRoot = imports.some(
      (imp) => imp === ScheduleModule || (typeof imp === 'object' && imp !== null && 'module' in imp && (imp as { module: unknown }).module === ScheduleModule),
    );
    expect(hasScheduleForRoot).toBe(false);
  });
});
