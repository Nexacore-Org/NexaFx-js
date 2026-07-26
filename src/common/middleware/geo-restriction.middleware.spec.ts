import { ConfigService } from '@nestjs/config';
import { GeoRestrictionMiddleware } from './geo-restriction.middleware';
import { AuditService } from '../../audit/audit.service';
import { NextFunction, Request, Response } from 'express';
import { IncomingHttpHeaders } from 'http';

type MockRequest = Pick<Request, 'ip' | 'originalUrl' | 'method'> & {
  headers: IncomingHttpHeaders;
};

type MockResponse = Pick<Response, 'status' | 'json'>;

describe('GeoRestrictionMiddleware', () => {
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  const auditService = {
    log: jest.fn(),
  } as unknown as AuditService;
  const middleware = new GeoRestrictionMiddleware(config, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks requests from configured countries', () => {
    (config.get as jest.Mock).mockReturnValue(['NG']);
    const response: MockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();
    const request: MockRequest = {
      headers: { 'cf-ipcountry': 'NG' },
      ip: '127.0.0.1',
      originalUrl: '/api/v1/auth/login',
      method: 'POST',
    };

    middleware.use(
      request as Request,
      response as Response,
      next as NextFunction,
    );

    expect(response.status).toHaveBeenCalledWith(451);
    expect(next).not.toHaveBeenCalled();
  });
});
