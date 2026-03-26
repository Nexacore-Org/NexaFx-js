import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam } from '@nestjs/swagger';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { FeeRulesAdminService } from '../services/fee-rules-admin.service';
import { CreateFeeRuleDto } from '../dto/create-fee-rule.dto';
import { UpdateFeeRuleDto } from '../dto/update-fee-rule.dto';

@ApiTags('Admin - Fee Rules')
@ApiBearerAuth('access-token')
@Controller('admin/fees/rules')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FeeAdminController {
  constructor(private readonly feeRulesAdminService: FeeRulesAdminService) {}

  @Post()
  @ApiOperation({ summary: 'Create a fee rule' })
  @ApiCreatedResponse({ description: 'Fee rule created successfully' })
  create(@Body() dto: CreateFeeRuleDto) {
    return this.feeRulesAdminService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all fee rules' })
  @ApiOkResponse({ description: 'List of fee rules' })
  findAll() {
    return this.feeRulesAdminService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee rule by ID' })
  @ApiParam({ name: 'id', description: 'Fee rule UUID' })
  @ApiOkResponse({ description: 'Fee rule' })
  findOne(@Param('id') id: string) {
    return this.feeRulesAdminService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a fee rule' })
  @ApiParam({ name: 'id', description: 'Fee rule UUID' })
  @ApiOkResponse({ description: 'Updated fee rule' })
  update(@Param('id') id: string, @Body() dto: UpdateFeeRuleDto) {
    return this.feeRulesAdminService.update(id, dto);
  }

  @Delete(':id/disable')
  @ApiOperation({ summary: 'Disable a fee rule' })
  @ApiParam({ name: 'id', description: 'Fee rule UUID' })
  disable(@Param('id') id: string) {
    return this.feeRulesAdminService.disable(id);
  }
}
