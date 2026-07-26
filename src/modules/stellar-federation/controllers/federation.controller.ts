import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StellarFederationService } from '../services/stellar-federation.service';
import { CreateFederationAddressDto } from '../dto/create-federation-address.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Stellar Federation')
@Controller('api/v1/federation')
export class FederationController {
  constructor(private readonly federationService: StellarFederationService) {}

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve a Stellar federation address (public)' })
  async resolve(@Query('q') q: string) {
    const result = await this.federationService.resolveAddress(q);
    return {
      success: true,
      data: {
        stellar_address: result.stellarAddress,
        memo: result.memo || '',
        memo_type: result.memoType || 'text',
      },
    };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a federation address' })
  async create(@Body() dto: CreateFederationAddressDto, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const address = await this.federationService.createAddress(userId, {
      name: dto.name,
      domain: dto.domain,
      stellarAddress: dto.stellarAddress,
      memo: dto.memo,
      memoType: dto.memoType,
    });
    return { success: true, data: address };
  }

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List federation addresses for current user' })
  async list(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const addresses = await this.federationService.getAddressesByUser(userId);
    return { success: true, data: addresses };
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a federation address' })
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    await this.federationService.deleteAddress(id, userId);
    return { success: true, message: 'Federation address deleted' };
  }
}
