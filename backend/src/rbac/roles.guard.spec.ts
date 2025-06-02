import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no roles are required', () => {
    const mockContext = createMockExecutionContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should throw UnauthorizedException if no user is found', () => {
    const mockContext = createMockExecutionContext();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
  });

  it('should allow access if user has required role', () => {
    const mockContext = createMockExecutionContext({
      headers: { authorization: 'Bearer valid-token' },
    });
    
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    jest.spyOn(jwtService, 'verify').mockReturnValue({
      sub: '1',
      email: 'admin@test.com',
      roles: ['admin'],
    });

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks required role', () => {
    const mockContext = createMockExecutionContext({
      headers: { authorization: 'Bearer valid-token' },
    });
    
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    jest.spyOn(jwtService, 'verify').mockReturnValue({
      sub: '1',
      email: 'user@test.com',
      roles: ['user'],
    });

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  function createMockExecutionContext(request = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }
});