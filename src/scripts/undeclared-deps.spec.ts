// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractImportedPackages, findUndeclared, packageNameFromSpecifier } = require('../../scripts/lib/undeclared-deps');

describe('undeclared dependency detection (issue #1548)', () => {
  it('maps specifiers to package names', () => {
    expect(packageNameFromSpecifier('express')).toBe('express');
    expect(packageNameFromSpecifier('express/lib/router')).toBe('express');
    expect(packageNameFromSpecifier('@nestjs/common')).toBe('@nestjs/common');
    expect(packageNameFromSpecifier('@socket.io/redis-adapter/dist')).toBe('@socket.io/redis-adapter');
  });

  it('ignores relative paths and Node built-ins', () => {
    expect(packageNameFromSpecifier('./local')).toBeNull();
    expect(packageNameFromSpecifier('../up')).toBeNull();
    expect(packageNameFromSpecifier('fs')).toBeNull();
    expect(packageNameFromSpecifier('node:crypto')).toBeNull();
    expect(packageNameFromSpecifier('fs/promises')).toBeNull();
  });

  it('extracts import, export-from, require and dynamic import forms', () => {
    const source = `
      import * as express from 'express';
      import { createClient } from "redis";
      import 'reflect-metadata';
      export { x } from '@scope/pkg/sub';
      const a = require('lodash');
      const b = await import('dayjs');
      import local from './local';
      // import ghost from 'commented-out';
    `;
    expect([...extractImportedPackages(source)].sort()).toEqual(
      ['@scope/pkg', 'dayjs', 'express', 'lodash', 'redis', 'reflect-metadata'].sort(),
    );
  });

  it('reports imports with no matching dependency and exits clean otherwise', () => {
    const files = [
      { path: 'src/a.ts', source: "import { createClient } from 'redis';" },
      { path: 'src/b.ts', source: "import { Injectable } from '@nestjs/common';" },
    ];

    const missing = findUndeclared(files, { dependencies: { '@nestjs/common': '^11' } });
    expect([...missing.keys()]).toEqual(['redis']);
    expect(missing.get('redis')).toEqual(['src/a.ts']);

    const ok = findUndeclared(files, { dependencies: { '@nestjs/common': '^11', redis: '^4' } });
    expect(ok.size).toBe(0);
  });

  it('counts devDependencies as declared and honours path aliases', () => {
    const files = [{ path: 'test/a.ts', source: "import request from 'supertest'; import x from 'src/app.module';" }];
    const result = findUndeclared(files, { devDependencies: { supertest: '^7' } }, { pathAliases: ['src'] });
    expect(result.size).toBe(0);
  });
});
