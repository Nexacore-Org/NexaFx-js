import { IsNotEmpty, IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ExperimentStatus } from '../entities/experiment.entity';

export class CreateExperimentDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsArray()
    @IsString({ each: true })
    variants: string[];

    @IsOptional()
    @IsEnum(ExperimentStatus)
    status?: ExperimentStatus;

    @IsOptional()
    startDate?: Date;

    @IsOptional()
    endDate?: Date;
}
