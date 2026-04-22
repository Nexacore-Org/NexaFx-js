import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
} from 'class-validator';
import { TemplateService } from '../services/template.service';
import { TemplateChannel } from '../entities/notification-template.entity';

class CreateTemplateDto {
  @IsNotEmpty() @IsString() @MaxLength(100) name: string;
  @IsEnum(TemplateChannel) channel: TemplateChannel;
  @IsOptional() @IsString() @MaxLength(10) locale?: string;
  @IsOptional() @IsString() @MaxLength(500) subjectTemplate?: string;
  @IsNotEmpty() @IsString() bodyTemplate: string;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredVariables?: string[];
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(500) subjectTemplate?: string;
  @IsOptional() @IsString() bodyTemplate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredVariables?: string[];
}

@Controller('admin/notification-templates')
export class TemplateAdminController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTemplateDto) {
    return this.templateService.create({
      ...dto,
      locale: dto.locale ?? 'en',
    });
  }

  @Get()
  findAll() {
    return this.templateService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    const template = await this.templateService.findOne(id);
    // Build sample data from requiredVariables
    const sampleData = Object.fromEntries(
      template.requiredVariables.map((v) => [v, `<${v}>`]),
    );
    return this.templateService.render(template, sampleData);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templateService.update(id, dto);
  }

  @Post(':id/versions/:version/restore')
  restore(@Param('id') id: string, @Param('version') version: string) {
    return this.templateService.restoreVersion(id, parseInt(version, 10));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}
