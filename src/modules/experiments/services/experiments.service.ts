import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ExperimentEntity, ExperimentStatus } from '../entities/experiment.entity';
import { ExperimentAssignmentEntity } from '../entities/experiment-assignment.entity';
import { CreateExperimentDto } from '../dto/create-experiment.dto';

@Injectable()
export class ExperimentsService {
    private readonly logger = new Logger(ExperimentsService.name);

    constructor(
        @InjectRepository(ExperimentEntity)
        private readonly experimentRepository: Repository<ExperimentEntity>,
        @InjectRepository(ExperimentAssignmentEntity)
        private readonly assignmentRepository: Repository<ExperimentAssignmentEntity>,
    ) { }

    async createExperiment(dto: CreateExperimentDto): Promise<ExperimentEntity> {
        const experiment = this.experimentRepository.create(dto);
        return this.experimentRepository.save(experiment);
    }

    async findAll(): Promise<ExperimentEntity[]> {
        return this.experimentRepository.find();
    }

    async updateStatus(id: string, status: ExperimentStatus): Promise<ExperimentEntity> {
        await this.experimentRepository.update(id, { status });
        return this.experimentRepository.findOneByOrFail({ id });
    }

    async getVariant(experimentName: string, userId: string): Promise<string | null> {
        const experiment = await this.experimentRepository.findOne({
            where: { name: experimentName },
        });

        if (!experiment) {
            this.logger.warn(`Experiment not found: ${experimentName}`);
            return null;
        }

        if (experiment.status !== ExperimentStatus.ACTIVE) {
            return null;
        }

        // Check for existing assignment
        const existingAssignment = await this.assignmentRepository.findOne({
            where: { experimentId: experiment.id, userId },
        });

        if (existingAssignment) {
            return existingAssignment.variant;
        }

        const hash = crypto
            .createHash('md5')
            .update(`${userId}:${experiment.id}`)
            .digest('hex');

        const hashInt = parseInt(hash.substring(0, 8), 16);
        const variantIndex = hashInt % experiment.variants.length;
        const variant = experiment.variants[variantIndex];

        const newAssignment = this.assignmentRepository.create({
            experimentId: experiment.id,
            userId,
            variant,
        });

        try {
            await this.assignmentRepository.save(newAssignment);
            return variant;
        } catch (error) {
            // Handle race conditions
            this.logger.warn(`Failed to save assignment for ${userId} in ${experimentName}: ${error.message}`);
            const retryAssignment = await this.assignmentRepository.findOne({
                where: { experimentId: experiment.id, userId },
            });
            return retryAssignment ? retryAssignment.variant : null;
        }
    }
}
