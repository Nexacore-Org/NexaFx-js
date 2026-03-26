import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';
import { Idempotent } from '../../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';

@ApiTags('Reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post()
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Create a reconciliation record' })
  @ApiCreatedResponse({ description: 'Reconciliation record created' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate reconciliation records (min 16 chars)', required: true })
  create(@Body() createReconciliationDto: CreateReconciliationDto) {
    return this.reconciliationService.create(createReconciliationDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all reconciliation records' })
  @ApiOkResponse({ description: 'List of reconciliation records' })
  findAll() {
    return this.reconciliationService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a reconciliation record by ID' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  @ApiOkResponse({ description: 'Reconciliation record' })
  findOne(@Param('id') id: string) {
    return this.reconciliationService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reconciliation record' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  @ApiOkResponse({ description: 'Updated reconciliation record' })
  update(
    @Param('id') id: string,
    @Body() updateReconciliationDto: UpdateReconciliationDto,
  ) {
    return this.reconciliationService.update(+id, updateReconciliationDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reconciliation record' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  remove(@Param('id') id: string) {
    return this.reconciliationService.remove(+id);
  }
}
