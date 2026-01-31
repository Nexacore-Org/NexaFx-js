import { IsEnum, IsNotEmpty } from 'class-validator';
import { ExperimentStatus } from '../entities/experiment.entity';

export class UpdateExperimentStatusDto {
    @IsNotEmpty()
    @IsEnum(ExperimentStatus)
    status: ExperimentStatus;
}
