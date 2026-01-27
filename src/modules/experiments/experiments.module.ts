import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentsService } from './services/experiments.service';
import { ExperimentsController } from './controllers/experiments.controller';
import { ExperimentEntity } from './entities/experiment.entity';
import { ExperimentAssignmentEntity } from './entities/experiment-assignment.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ExperimentEntity, ExperimentAssignmentEntity])],
    controllers: [ExperimentsController],
    providers: [ExperimentsService],
    exports: [ExperimentsService],
})
export class ExperimentsModule { }
