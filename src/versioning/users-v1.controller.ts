import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Deprecated } from '../decorators/deprecated.decorator';
import { ApiVersion } from '../decorators/api-version.decorator';
import { VersioningService } from '../services/versioning.service';
import { UserResponseV1Dto } from '../dto/v1/user-response-v1.dto';

@ApiTags('Users V1 (Deprecated)')
@Controller({ path: 'users', version: '1' })
@Deprecated({
  version: '1',
  deprecatedAt: '2025-01-01',
  sunsetDate: '2026-01-01',
  replacementEndpoint: '/v2/users',
  message: 'Please migrate to /v2/users for improved response format.',
})
export class UsersV1Controller {
  constructor(private readonly versioningService: VersioningService) {}

  @Get()
  @ApiOperation({
    summary: '[DEPRECATED] List users',
    description: 'Deprecated. Use GET /v2/users instead.',
  })
  findAll(): UserResponseV1Dto[] {
    // V1 returns flat structure
    return [
      { id: '1', name: 'Alice Smith', email: 'alice@example.com' },
      { id: '2', name: 'Bob Jones', email: 'bob@example.com' },
    ];
  }

  @Get('version')
  @ApiOperation({ summary: '[DEPRECATED] Get version info' })
  getVersion() {
    return {
      version: '1',
      deprecated: true,
      message: 'This endpoint is deprecated.',
      ...this.versioningService.getApiVersionSummary(),
    };
  }
}
