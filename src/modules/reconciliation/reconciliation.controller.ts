import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post()
  create(@Body() createReconciliationDto: CreateReconciliationDto) {
    return this.reconciliationService.create(createReconciliationDto);
  }

  @Get()
  findAll() {
    return this.reconciliationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reconciliationService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateReconciliationDto: UpdateReconciliationDto,
  ) {
    return this.reconciliationService.update(+id, updateReconciliationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reconciliationService.remove(+id);
  }
}
