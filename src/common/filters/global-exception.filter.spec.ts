import { GlobalExceptionFilter } from './global-exception.filter';
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
});
