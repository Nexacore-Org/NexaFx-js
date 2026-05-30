import { IDEMPOTENCY_KEY, Idempotent } from './idempotency.decorator';

describe('Idempotent decorator', () => {
  class TestController {
    @Idempotent()
    execute() {
      return true;
    }
  }

  it('marks a handler as idempotent', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'execute',
    );

    expect(
      Reflect.getMetadata(IDEMPOTENCY_KEY, descriptor?.value as object),
    ).toBe(true);
  });
});
