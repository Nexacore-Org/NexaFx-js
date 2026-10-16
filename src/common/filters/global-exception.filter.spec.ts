import { GlobalExceptionFilter, isSensitiveField } from './global-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Request, Response } from 'express';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockHost: ArgumentsHost;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();

    mockRequest = {
      url: '/test',
      method: 'POST',
      body: {},
      headers: {},
    } as Partial<Request>;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle HttpException', () => {
    const httpException = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    jest.spyOn(httpException, 'getResponse').mockReturnValue('Forbidden access');
    jest.spyOn(httpException, 'getStatus').mockReturnValue(HttpStatus.FORBIDDEN);

    filter.catch(httpException, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Forbidden access',
      timestamp: expect.any(String),
      path: '/test',
    });
  });

  it('should handle non-HTTP exceptions', () => {
    const error = new Error('Internal error');
    const loggerErrorSpy = jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

    filter.catch(error, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/test',
    });
  });

  it('logs at WARN level for 4xx errors', () => {
    const warnSpy = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(warnSpy).toHaveBeenCalled();
  });

  it('logs at ERROR level for 5xx errors', () => {
    const errorSpy = jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const exception = new HttpException('Server Error', HttpStatus.INTERNAL_SERVER_ERROR);

    filter.catch(exception, mockHost);

    expect(errorSpy).toHaveBeenCalled();
  });

  it('masks sensitive fields in logged request body', () => {
    const warnSpy = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    mockRequest.body = { username: 'alice', password: 'secret', otp: '123456', totpCode: 'abc', secretKey: 'key' };
    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

    filter.catch(exception, mockHost);

    const logPayload = (warnSpy.mock.calls[0][0] as { body: Record<string, unknown> });
    expect(logPayload.body).toEqual({
      username: 'alice',
      password: '[REDACTED]',
      otp: '[REDACTED]',
      totpCode: '[REDACTED]',
      secretKey: '[REDACTED]',
    });
  });

  it('includes method, path, and error in log payload', () => {
    const warnSpy = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    mockRequest.method = 'POST';
    mockRequest.url = '/auth/login';
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    const logPayload = warnSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logPayload.method).toBe('POST');
    expect(logPayload.path).toBe('/auth/login');
  });

  it('redacts credential fields whose names do not match the original four', () => {
    const warnSpy = jest
      .spyOn(filter['logger'], 'warn')
      .mockImplementation(() => undefined);
    mockRequest.body = {
      email: 'alice@example.com',
      passwordHash: 'raw-credential',
      code: '123456',
      secret: 'api-secret',
      refreshToken: 'rt-value',
      backupCode: 'bc-value',
      twoFactorSecret: 'tfa-value',
      api_key: 'ak-value',
      referralCode: 'FRIEND10',
    };
    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

    filter.catch(exception, mockHost);

    const logPayload = warnSpy.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(logPayload.body).toEqual({
      email: 'alice@example.com',
      passwordHash: '[REDACTED]',
      code: '[REDACTED]',
      secret: '[REDACTED]',
      refreshToken: '[REDACTED]',
      backupCode: '[REDACTED]',
      twoFactorSecret: '[REDACTED]',
      api_key: '[REDACTED]',
      // Not a credential — kept so 4xx logs stay useful.
      referralCode: 'FRIEND10',
    });
  });

  it('redacts sensitive fields nested inside objects and arrays', () => {
    const warnSpy = jest
      .spyOn(filter['logger'], 'warn')
      .mockImplementation(() => undefined);
    mockRequest.body = {
      user: { email: 'alice@example.com', password: 'raw' },
      devices: [{ id: 'd1', token: 'push-token' }],
    };
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const logPayload = warnSpy.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect(logPayload.body).toEqual({
      user: { email: 'alice@example.com', password: '[REDACTED]' },
      devices: [{ id: 'd1', token: '[REDACTED]' }],
    });
  });

  describe('isSensitiveField', () => {
    // Field names taken from the DTOs and entities actually used across
    // auth, otp, api-keys, webhooks and 2FA. A new sensitive field that this
    // list does not cover should be added here along with the pattern for it.
    it.each([
      'password',
      'passwordHash',
      'newPassword',
      'newPasswordHash',
      'currentPassword',
      'passwordSalt',
      'otp',
      'code',
      'totpCode',
      'twoFactorSecret',
      'secret',
      'secretKey',
      'token',
      'rawToken',
      'tokenHash',
      'authToken',
      'accessToken',
      'refreshToken',
      'backupCode',
      'recoveryCode',
      'signature',
      'apiKey',
      'api_key',
      'authorization',
    ])('treats %s as sensitive', (field) => {
      expect(isSensitiveField(field)).toBe(true);
    });

    it.each([
      'email',
      'firstName',
      'lastName',
      'referralCode',
      'countryCode',
      'currency',
      'amount',
      'accountId',
      'documentType',
      'status',
    ])('leaves %s readable', (field) => {
      expect(isSensitiveField(field)).toBe(false);
    });
  });

  describe('structured payloads (#1354)', () => {
    it('passes requiresAction and version through for a terms-acceptance 403', () => {
      filter.catch(
        new HttpException({ requiresAction: 'accept_terms', version: '1.1' }, HttpStatus.FORBIDDEN),
        mockHost,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          requiresAction: 'accept_terms',
          version: '1.1',
        }),
      );
    });

    it('keeps submissionId on a duplicate KYC submission 409', () => {
      filter.catch(
        new HttpException(
          { message: 'An active KYC submission already exists for this user', submissionId: 'sub-1' },
          HttpStatus.CONFLICT,
        ),
        mockHost,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'An active KYC submission already exists for this user',
          submissionId: 'sub-1',
        }),
      );
    });

    it('keeps requiresAction together with its message', () => {
      filter.catch(
        new HttpException(
          { requiresAction: 'verify_email', message: 'Email verification required' },
          HttpStatus.FORBIDDEN,
        ),
        mockHost,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ requiresAction: 'verify_email', message: 'Email verification required' }),
      );
    });

    it('forwards Nest error labels and ValidationPipe array messages', () => {
      filter.catch(
        new HttpException(
          { statusCode: 400, message: ['email must be an email', 'password too short'], error: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        ),
        mockHost,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: ['email must be an email', 'password too short'],
          error: 'Bad Request',
        }),
      );
    });

    it('does not forward fields outside the allow-list', () => {
      filter.catch(
        new HttpException({ message: 'nope', internalStack: 'secret', requiresAction: 'x' }, HttpStatus.FORBIDDEN),
        mockHost,
      );
      const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(body).not.toHaveProperty('internalStack');
    });

    it('never forwards payload fields on 5xx responses', () => {
      jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
      filter.catch(
        new HttpException({ message: 'boom', requiresAction: 'x', submissionId: 's', code: 'c' }, HttpStatus.INTERNAL_SERVER_ERROR),
        mockHost,
      );
      const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(body).not.toHaveProperty('requiresAction');
      expect(body).not.toHaveProperty('submissionId');
      expect(body).not.toHaveProperty('code');
    });

    it('echoes the correlation id and logs the user id from user.sub', () => {
      mockRequest.headers = { 'x-correlation-id': 'corr-1' };
      (mockRequest as any).user = { sub: 'user-9' };
      const warn = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
      filter.catch(new HttpException('Nope', HttpStatus.BAD_REQUEST), mockHost);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr-1' }));
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-9' }));
    });
  });
});
