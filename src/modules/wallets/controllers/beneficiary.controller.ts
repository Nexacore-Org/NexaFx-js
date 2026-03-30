import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BeneficiaryService } from '../services/beneficiary.service';
import { CreateBeneficiaryDto, UpdateBeneficiaryDto } from '../dto/beneficiary.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Beneficiaries')
@ApiBearerAuth('access-token')
@Controller('wallets/beneficiaries')
@UseGuards(JwtAuthGuard)
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a trusted beneficiary address' })
  create(@Body() dto: CreateBeneficiaryDto, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.beneficiaryService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all beneficiaries for the current user' })
  findAll(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.beneficiaryService.findAll(userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Beneficiary UUID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.beneficiaryService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update beneficiary — editing address triggers re-verification' })
  @ApiParam({ name: 'id', description: 'Beneficiary UUID' })
  update(@Param('id') id: string, @Body() dto: UpdateBeneficiaryDto, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.beneficiaryService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Beneficiary UUID' })
  remove(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.beneficiaryService.remove(id, userId);
  }
}
