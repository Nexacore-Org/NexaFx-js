import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionCategoryEntity } from '../entities/transaction-category.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(TransactionCategoryEntity)
    private readonly categoryRepo: Repository<TransactionCategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async findAll() {
    const categories = await this.categoryRepo.find({
      order: { name: 'ASC' },
    });

    return {
      success: true,
      data: categories,
    };
  }

  async create(dto: CreateCategoryDto) {
    const category = this.categoryRepo.create(dto);
    const saved = await this.categoryRepo.save(category);

    return {
      success: true,
      data: saved,
    };
  }

  async assignCategory(transactionId: string, categoryId: string) {
    // Verify category exists
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      return {
        success: false,
        message: 'Category not found',
      };
    }

    // Update transaction
    const result = await this.txRepo.update(transactionId, { categoryId });

    if (result.affected === 0) {
      return {
        success: false,
        message: 'Transaction not found',
      };
    }

    return {
      success: true,
      message: 'Category assigned successfully',
    };
  }
}
