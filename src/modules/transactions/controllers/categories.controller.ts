import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from '../services/categories.service';
import { CategorizationService } from '../services/categorization.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { AssignCategoryDto } from '../dto/assign-category.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';

@Controller('transactions')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categorizationService: CategorizationService,
  ) {}

  @Get('categories')
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post('categories')
  create(@Body(ValidationPipe) dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id/category')
  @UseGuards(JwtAuthGuard)
  async assignCategory(
    @Param('id') transactionId: string,
    @Body(ValidationPipe) dto: AssignCategoryDto,
  ) {
    await this.categorizationService.overrideCategory(transactionId, dto.categoryId);
    return { success: true, message: 'Category overridden successfully' };
  }

  @Post('categories/bulk-recategorize')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async bulkRecategorize() {
    return this.categorizationService.bulkRecategorize();
  }
}
