import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    UseGuards,
} from '@nestjs/common';
import { ExperimentsService } from '../services/experiments.service';
import { CreateExperimentDto } from '../dto/create-experiment.dto';
import { UpdateExperimentStatusDto } from '../dto/update-experiment-status.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@Controller('experiments')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ExperimentsController {
    constructor(private readonly experimentsService: ExperimentsService) { }

    @Post()
    create(@Body() createExperimentDto: CreateExperimentDto) {
        return this.experimentsService.createExperiment(createExperimentDto);
    }

    @Get()
    findAll() {
        return this.experimentsService.findAll();
    }

    @Patch(':id/status')
    updateStatus(
        @Param('id') id: string,
        @Body() updateStatusDto: UpdateExperimentStatusDto,
    ) {
        return this.experimentsService.updateStatus(id, updateStatusDto.status);
    }
}
