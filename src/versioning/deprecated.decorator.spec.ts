import 'reflect-metadata';
import { Deprecated } from '../../src/versioning/decorators/deprecated.decorator';
import {
  DEPRECATION_METADATA_KEY,
  DEPRECATION_INFO_METADATA_KEY,
} from '../../src/versioning/constants/api-version.constants';

describe('@Deprecated decorator', () => {
  const deprecationOptions = {
    version: '1',
    deprecatedAt: '2025-01-01',
    sunsetDate: '2026-01-01',
    replacementEndpoint: '/v2/users',
    message: 'Please migrate to v2.',
  };

  it('should set DEPRECATION_METADATA_KEY to true on a class', () => {
    @Deprecated(deprecationOptions)
    class TestClass {}

    const isDeprecated = Reflect.getMetadata(
      DEPRECATION_METADATA_KEY,
      TestClass,
    );
    expect(isDeprecated).toBe(true);
  });

  it('should set DEPRECATION_INFO_METADATA_KEY on a class', () => {
    @Deprecated(deprecationOptions)
    class TestClass {}

    const info = Reflect.getMetadata(DEPRECATION_INFO_METADATA_KEY, TestClass);
    expect(info).toEqual(deprecationOptions);
  });

  it('should set metadata on a method', () => {
    class TestClass {
      @Deprecated(deprecationOptions)
      testMethod() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestClass.prototype,
      'testMethod',
    );
    const isDeprecated = Reflect.getMetadata(
      DEPRECATION_METADATA_KEY,
      descriptor!.value,
    );
    expect(isDeprecated).toBe(true);
  });

  it('should preserve all deprecation fields', () => {
    @Deprecated(deprecationOptions)
    class TestClass {}

    const info = Reflect.getMetadata(DEPRECATION_INFO_METADATA_KEY, TestClass);
    expect(info.version).toBe('1');
    expect(info.deprecatedAt).toBe('2025-01-01');
    expect(info.sunsetDate).toBe('2026-01-01');
    expect(info.replacementEndpoint).toBe('/v2/users');
    expect(info.message).toBe('Please migrate to v2.');
  });

  it('should work without optional fields', () => {
    const minimalOptions = { version: '1', deprecatedAt: '2025-01-01' };

    @Deprecated(minimalOptions)
    class TestClass {}

    const info = Reflect.getMetadata(DEPRECATION_INFO_METADATA_KEY, TestClass);
    expect(info.version).toBe('1');
    expect(info.sunsetDate).toBeUndefined();
    expect(info.replacementEndpoint).toBeUndefined();
  });
});
