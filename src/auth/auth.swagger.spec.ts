import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetFlowService } from './password-reset-flow.service';
import { PasswordPolicyService } from './password-policy.service';

/** Issue #1528: the generated OpenAPI document for /auth/* matches what the code enforces. */
describe('Swagger contract for /auth/* (issue #1528)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: PasswordResetFlowService, useValue: {} },
        { provide: PasswordPolicyService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('t').addBearerAuth().build());
  });

  afterAll(() => app.close());

  const op = (path: string, method: 'get' | 'post') => (doc.paths[path] as any)?.[method];
  const schema = (name: string) => (doc.components?.schemas as any)?.[name];

  it.each([
    ['/auth/register', 'post'],
    ['/auth/login', 'post'],
    ['/auth/refresh', 'post'],
    ['/auth/logout', 'post'],
    ['/auth/forgot-password', 'post'],
    ['/auth/reset-password', 'post'],
  ] as const)('%s documents 400 and 429', (path, method) => {
    const responses = Object.keys(op(path, method).responses);
    expect(responses).toEqual(expect.arrayContaining(['400', '429']));
  });

  it('login and refresh document 401; logout documents 401 and bearer auth', () => {
    expect(Object.keys(op('/auth/login', 'post').responses)).toContain('401');
    expect(Object.keys(op('/auth/refresh', 'post').responses)).toContain('401');
    expect(Object.keys(op('/auth/logout', 'post').responses)).toEqual(expect.arrayContaining(['401', '204']));
    expect(op('/auth/logout', 'post').security).toEqual(expect.arrayContaining([{ bearer: [] }]));
  });

  it('refresh and logout have a typed request body', () => {
    expect(op('/auth/refresh', 'post').requestBody.content['application/json'].schema.$ref).toContain('RefreshTokenDto');
    expect(schema('RefreshTokenDto').properties.refreshToken).toMatchObject({ minLength: 16, maxLength: 512 });
  });

  it('password constraints agree with the real policy (12-128), not the old 8', () => {
    expect(schema('ResetPasswordDto').properties.newPassword).toMatchObject({ minLength: 12, maxLength: 128 });
    expect(schema('RegisterDto').properties.password).toMatchObject({ minLength: 12, maxLength: 128 });
  });

  it('login accepts any non-empty password up to 128 characters and no longer documents totpCode', () => {
    expect(schema('LoginDto').properties.password).toMatchObject({ maxLength: 128 });
    expect(schema('LoginDto').properties.password.minLength).toBeUndefined();
    expect(schema('LoginDto').properties.totpCode).toBeUndefined();
  });

  it('bounds email and names', () => {
    expect(schema('LoginDto').properties.email.maxLength).toBe(254);
    expect(schema('RegisterDto').properties.firstName.maxLength).toBe(100);
    expect(schema('RegisterDto').properties.lastName.maxLength).toBe(100);
  });
});
