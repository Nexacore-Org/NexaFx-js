import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalPolicyService } from './services/approval-policy.service';
import { CreateApprovalPolicyDto, UpdateApprovalPolicyDto } from './dto/approval-policy.dto';

@ApiTags('Admin - Approval Policies')
@ApiBearerAuth()
@Controller('admin/approval-policies')
export class ApprovalPolicyController {
  constructor(private readonly policyService: ApprovalPolicyService) {}

  @Post()
  @ApiOperation({ summary: 'Create approval policy' })
  create(@Body() dto: CreateApprovalPolicyDto) {
    return this.policyService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active approval policies' })
  findAll() {
    return this.policyService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get approval policy by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.policyService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update approval policy (audit-logged)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApprovalPolicyDto,
  ) {
    // In production, extract changedBy from JWT; using placeholder here
    return this.policyService.update(id, dto, 'admin');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete approval policy' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.policyService.remove(id);
  }

  @Get(':id/pending')
  @ApiOperation({ summary: 'Get pending transactions under this policy' })
  getPending(@Param('id', ParseUUIDPipe) id: string) {
    return this.policyService.getPendingTransactionsByPolicy(id);
  }
}
