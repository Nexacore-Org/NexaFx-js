import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { CreateCatDto } from './dtos/create-cat.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('cats')
  createCat(@Body() createCatDto: CreateCatDto) {
    return 'This action adds a new cat';
  }
}
