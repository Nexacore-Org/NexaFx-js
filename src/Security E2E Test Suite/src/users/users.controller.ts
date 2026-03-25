import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  /** Any authenticated user can list users */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return [{ id: 1, username: 'alice' }];
  }

  /** Only superadmin can delete users */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  remove(@Param('id') id: string) {
    return { deleted: id };
  }
}
