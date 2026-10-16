import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/authenticated-user.interface';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { EscrowService } from './escrow.service';

/** The acting user always comes from the authenticated principal, never from the body. */
@ApiTags('escrow')
@ApiBearerAuth()
@Controller('escrow')
export class EscrowController {
  constructor(private readonly escrow: EscrowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Hold funds from the caller for a payee' })
  hold(@CurrentUser('id') payerId: string, @Body() dto: CreateEscrowDto) {
    return this.escrow.hold(payerId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Escrows where the caller is payer or payee' })
  list(@CurrentUser('id') userId: string) {
    return this.escrow.listForUser(userId);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release held funds to the payee (payer only)' })
  release(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.escrow.release(id, { id: user.id, role: user.role });
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund held funds to the payer (payee or admin)' })
  refund(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.escrow.refund(id, { id: user.id, role: user.role });
  }
}
