import { IsUUID } from 'class-validator';

export class AssignCategoryDto {
  @IsUUID()
  categoryId: string;
}
