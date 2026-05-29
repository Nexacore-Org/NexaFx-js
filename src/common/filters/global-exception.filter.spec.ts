import { GlobalExceptionFilter } from './global-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockHost: ArgumentsHost;
  let mockRequest: Request;
  let mockResponse: Response;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();

    mockRequest = {
      url: '/test',
    } as Request;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle HttpException', () => {
    const httpException = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    // Override the getResponse to return a string for simplicity
    // In reality, getResponse can return string or object
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
    // Mock the logger error method
    const loggerErrorSpy = jest.spyOn(filter['logger'], 'error');

    filter.catch(error, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unexpected exception: Internal error',
      error.stack,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: expect.any(String),
      path: '/test',
    });
  });
});