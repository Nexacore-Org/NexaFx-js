import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { AssignCategoryDto } from '../dto/assign-category.dto';

@Controller('transactions')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('categories')
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post('categories')
  create(@Body(ValidationPipe) dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id/category')
  assignCategory(
    @Param('id') transactionId: string,
    @Body(ValidationPipe) dto: AssignCategoryDto,
  ) {
    return this.categoriesService.assignCategory(transactionId, dto.categoryId);
  }
}
