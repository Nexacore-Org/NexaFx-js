import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { FxForwardContractService, CreateForwardDto } from '../services/fx-forward-contract.service';
import { FxExposureService } from '../services/fx-exposure.service';

@UseGuards(JwtAuthGuard)
@Controller('fx/forwards')
export class FxForwardContractController {
  constructor(
    private readonly forwardService: FxForwardContractService,
    private readonly exposureService: FxExposureService,
  ) {}

  /** POST /fx/forwards — book a forward contract */
  @Post()
  book(@Req() req: any, @Body() dto: CreateForwardDto) {
    return this.forwardService.book(req.user.id, dto);
  }

  /** GET /fx/forwards — list user's active and settled contracts */
  @Get()
  list(@Req() req: any) {
    return this.forwardService.listForUser(req.user.id);
  }

  /** DELETE /fx/forwards/:id — cancel a contract early */
  @Delete(':id')
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.forwardService.cancel(req.user.id, id);
  }

  /** GET /fx/forwards/exposure — aggregate exposure per currency pair */
  @Get('exposure')
  exposure() {
    return this.exposureService.getAllExposures();
  }
}
