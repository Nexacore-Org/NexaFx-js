import { Test } from '@nestjs/testing';
import { VersionNegotiationMiddleware } from '../../src/versioning/middleware/version-negotiation.middleware';
import { Request, Response } from 'express';

function createMockReqRes(overrides: Partial<Request> = {}) {
  const setHeader = jest.fn();
  const req = {
    path: '/v2/users',
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  } as unknown as Request;

  const res = { setHeader } as unknown as Response;
  const next = jest.fn();

  return { req, res, next, setHeader };
}

describe('VersionNegotiationMiddleware', () => {
  let middleware: VersionNegotiationMiddleware;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [VersionNegotiationMiddleware],
    }).compile();

    middleware = module.get<VersionNegotiationMiddleware>(
      VersionNegotiationMiddleware,
    );
  });

  it('should call next()', () => {
    const { req, res, next } = createMockReqRes();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should call next() for v1 routes (deprecated)', () => {
    const { req, res, next } = createMockReqRes({ path: '/v1/users' } as any);
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should call next() for routes without version', () => {
    const { req, res, next } = createMockReqRes({ path: '/health' } as any);
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should handle Accept header versioning for supported version', () => {
    const { req, res, next } = createMockReqRes({
      path: '/users',
      headers: { accept: 'application/vnd.nexafx.v2+json' },
    } as any);
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should handle Accept header versioning for unsupported version and set default', () => {
    const { req, res, next, setHeader } = createMockReqRes({
      path: '/users',
      headers: { accept: 'application/vnd.nexafx.v99+json' },
    } as any);
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    // Should set default version header
    expect(setHeader).toHaveBeenCalledWith('X-API-Version', expect.any(String));
  });
});
