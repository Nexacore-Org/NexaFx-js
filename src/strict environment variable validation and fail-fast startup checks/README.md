# NestJS Environment Validation

Strict runtime validation for environment variables using Zod schema validation.

## Features

✅ **Strict validation at boot** - Application fails fast if config is invalid  
✅ **Type-safe configuration** - Full TypeScript support  
✅ **Comprehensive validation** - DB, JWT, encryption, APIs, mail  
✅ **Sensitive value masking** - Secrets are masked in logs  
✅ **Clear error messages** - Know exactly what's misconfigured  
✅ **Production-ready** - Prevents silent failures in production

## Installation

```bash
npm install @nestjs/config zod
```

## Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Fill in your actual values in `.env`

3. The application will validate all variables at startup

## Validated Environment Variables

### Database

- `DB_HOST` - Database host (required)
- `DB_PORT` - Database port (1-65535)
- `DB_USERNAME` - Database username (required)
- `DB_PASSWORD` - Database password (required)
- `DB_DATABASE` - Database name (required)
- `DB_SSL` - Enable SSL (true/false)

### JWT

- `JWT_SECRET` - JWT secret key (min 32 chars for security)
- `JWT_EXPIRY` - Token expiry in seconds

### Wallet Encryption

- `WALLET_ENCRYPTION_KEY` - Encryption key (exactly 32 chars)

### External API

- `EXTERNAL_API_KEY` - API key (required)
- `EXTERNAL_API_URL` - API base URL (must be valid URL)

### Mail

- `MAIL_HOST` - SMTP host (required)
- `MAIL_PORT` - SMTP port (1-65535)
- `MAIL_USER` - SMTP username (valid email)
- `MAIL_PASSWORD` - SMTP password (required)
- `MAIL_FROM` - From email address (valid email)

### Application

- `NODE_ENV` - Environment (development/production/test)
- `PORT` - Application port (1-65535)

## Usage

### In Your Services

```typescript
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class YourService {
  constructor(private configService: ConfigService) {}

  someMethod() {
    // Type-safe access to validated config
    const dbHost = this.configService.get<string>("database.host");
    const jwtSecret = this.configService.get<string>("jwt.secret");
  }
}
```

## Validation Behavior

### ✅ Valid Configuration

Application starts normally with masked sensitive values in logs:

```
[Bootstrap] Application configuration loaded successfully
[Bootstrap] JWT Secret: abcd****************wxyz
[Bootstrap] Application is running on: http://localhost:3000
```

### ❌ Invalid Configuration

Application fails immediately with clear error:

```
[Bootstrap] Failed to start application
Environment validation failed:
JWT_SECRET: String must contain at least 32 character(s)
WALLET_ENCRYPTION_KEY: String must contain exactly 32 character(s)
EXTERNAL_API_URL: Invalid url
```

## Adding New Variables

1. Add to schema in `src/config/env.validation.ts`:

```typescript
export const envSchema = z.object({
  // ... existing fields
  NEW_VAR: z.string().min(1, "NEW_VAR is required"),
});
```

2. Add to configuration in `src/config/configuration.ts`:

```typescript
export default (validatedEnv: EnvConfig) => ({
  // ... existing groups
  newGroup: {
    newVar: validatedEnv.NEW_VAR,
  },
});
```

3. Add to `.env.example`

## Security Features

- **Startup validation** - No silent misconfigurations
- **Sensitive masking** - Secrets shown as `abcd****wxyz` in logs
- **Type safety** - Compile-time checks for config access
- **Fail-fast** - Application won't start with invalid config

## Benefits

✅ No silent config errors  
✅ Safer production deployments  
✅ Faster debugging  
✅ Better developer experience  
✅ Production-grade security
