import { Injectable } from '@nestjs/common';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { UpdateReconciliationDto } from './dto/update-reconciliation.dto';

@Injectable()
export class ReconciliationService {
  create(createReconciliationDto: CreateReconciliationDto) {
    return 'This action adds a new reconciliation';
  }

  findAll() {
    return `This action returns all reconciliation`;
  }

  findOne(id: number) {
    return `This action returns a #${id} reconciliation`;
  }

  update(id: number, updateReconciliationDto: UpdateReconciliationDto) {
    return `This action updates a #${id} reconciliation`;
  }

  remove(id: number) {
    return `This action removes a #${id} reconciliation`;
  }
}
