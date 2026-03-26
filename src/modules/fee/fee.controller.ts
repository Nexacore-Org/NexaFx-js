import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { FeeService } from './fee.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { Idempotent } from '../../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';

@ApiTags('Fees')
@Controller('fee')
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Post()
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a fee record' })
  @ApiCreatedResponse({ description: 'Fee created successfully' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate fee creation (min 16 chars)', required: true })
  create(@Body() createFeeDto: CreateFeeDto) {
    return this.feeService.create(createFeeDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all fee records' })
  @ApiOkResponse({ description: 'List of fee records' })
  findAll() {
    return this.feeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee record by ID' })
  @ApiParam({ name: 'id', description: 'Fee record ID' })
  @ApiOkResponse({ description: 'Fee record' })
  findOne(@Param('id') id: string) {
    return this.feeService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a fee record' })
  @ApiParam({ name: 'id', description: 'Fee record ID' })
  @ApiOkResponse({ description: 'Updated fee record' })
  update(@Param('id') id: string, @Body() updateFeeDto: UpdateFeeDto) {
    return this.feeService.update(+id, updateFeeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a fee record' })
  @ApiParam({ name: 'id', description: 'Fee record ID' })
  remove(@Param('id') id: string) {
    return this.feeService.remove(+id);
  }
}
