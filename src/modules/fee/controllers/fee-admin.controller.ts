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
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { FeeRulesAdminService } from '../services/fee-rules-admin.service';
import { CreateFeeRuleDto } from '../dto/create-fee-rule.dto';
import { UpdateFeeRuleDto } from '../dto/update-fee-rule.dto';

@Controller('admin/fees/rules')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FeeAdminController {
  constructor(private readonly feeRulesAdminService: FeeRulesAdminService) {}

  @Post()
  create(@Body() dto: CreateFeeRuleDto) {
    return this.feeRulesAdminService.create(dto);
  }

  @Get()
  findAll() {
    return this.feeRulesAdminService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.feeRulesAdminService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeeRuleDto) {
    return this.feeRulesAdminService.update(id, dto);
  }

  @Delete(':id/disable')
  disable(@Param('id') id: string) {
    return this.feeRulesAdminService.disable(id);
  }
}
