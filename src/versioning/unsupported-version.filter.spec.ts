import { Test } from '@nestjs/testing';
import { NotFoundException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { UnsupportedVersionFilter } from '../../src/versioning/filters/unsupported-version.filter';

function createMockHost(path: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const mockResponse = { status };
  const mockRequest = { path, ip: '127.0.0.1' };

  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost,
    mockResponse,
    json,
    status,
  };
}

describe('UnsupportedVersionFilter', () => {
  let filter: UnsupportedVersionFilter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UnsupportedVersionFilter],
    }).compile();

    filter = module.get<UnsupportedVersionFilter>(UnsupportedVersionFilter);
  });

  it('should pass through NotFoundException for valid versioned routes', () => {
    const exception = new NotFoundException('Resource not found');
    const { host, status, json } = createMockHost('/v2/users/nonexistent');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('should return 404 with version info for unsupported version', () => {
    const exception = new NotFoundException();
    const { host, status, json } = createMockHost('/v99/users');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: expect.stringContaining('v99'),
        supportedVersions: expect.any(Array),
        currentVersion: expect.any(String),
      }),
    );
  });

  it('should pass through for non-versioned paths', () => {
    const exception = new NotFoundException('Not Found');
    const { host, status, json } = createMockHost('/users/notfound');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('should include supportedVersions in the error response for unsupported version', () => {
    const exception = new NotFoundException();
    const { host, json } = createMockHost('/v0/users');

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        supportedVersions: expect.arrayContaining(['1', '2']),
      }),
    );
  });
});
