import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { FeeTiersService } from './fee-tiers.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt.guard';

@ApiTags('Fee Tiers')
@ApiBearerAuth('access-token')
@Controller('fee-tiers')
@UseGuards(JwtAuthGuard)
export class FeeTiersController {
  constructor(private readonly feeTiersService: FeeTiersService) {}

  @Get()
  @ApiOperation({ summary: 'List all fee tiers' })
  @ApiOkResponse({ description: 'List of active fee tiers' })
  async findAll() {
    return this.feeTiersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee tier by ID' })
  @ApiParam({ name: 'id', description: 'Fee tier ID' })
  @ApiOkResponse({ description: 'Fee tier details' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.feeTiersService.findOne(id);
  }
}
