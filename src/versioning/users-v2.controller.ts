import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiVersion } from '../decorators/api-version.decorator';
import { VersioningService } from '../services/versioning.service';
import { UserResponseV2Dto } from '../dto/v2/user-response-v2.dto';

@ApiTags('Users V2')
@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  constructor(private readonly versioningService: VersioningService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  findAll(): { data: UserResponseV2Dto[]; meta: object } {
    // V2 returns paginated wrapper
    return {
      data: [
        {
          id: '1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          createdAt: new Date().toISOString(),
        },
      ],
      meta: { total: 2, page: 1, limit: 10 },
    };
  }

  @Get('version')
  @ApiOperation({ summary: 'Get API version info' })
  getVersion() {
    return this.versioningService.getApiVersionSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string): UserResponseV2Dto {
    return {
      id,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      createdAt: new Date().toISOString(),
    };
  }
}
