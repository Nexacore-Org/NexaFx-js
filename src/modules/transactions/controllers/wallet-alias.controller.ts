import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { WalletAliasService } from '../services/wallet-alias.service';
import { CreateWalletAliasDto } from '../dto/create-wallet-alias.dto';
import { UpdateWalletAliasDto } from '../dto/update-wallet-alias.dto';

@Controller('wallet-aliases')
@UseGuards(JwtAuthGuard)
export class WalletAliasController {
  constructor(private readonly walletAliasService: WalletAliasService) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateWalletAliasDto) {
    const userId = req.user?.id;
    const walletAlias = await this.walletAliasService.create(userId, dto);

    return {
      success: true,
      data: walletAlias,
    };
  }

  @Get()
  async findAll(@Request() req: any) {
    const userId = req.user?.id;
    const walletAliases = await this.walletAliasService.findAllByUser(userId);

    return {
      success: true,
      data: walletAliases,
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateWalletAliasDto,
  ) {
    const userId = req.user?.id;
    const walletAlias = await this.walletAliasService.update(id, userId, dto);

    return {
      success: true,
      data: walletAlias,
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    await this.walletAliasService.delete(id, userId);

    return {
      success: true,
      message: 'Wallet alias deleted successfully',
    };
  }
}