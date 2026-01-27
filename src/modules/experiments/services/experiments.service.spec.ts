import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExperimentsService } from './experiments.service';
import { ExperimentEntity, ExperimentStatus } from '../entities/experiment.entity';
import { ExperimentAssignmentEntity } from '../entities/experiment-assignment.entity';
import { Repository } from 'typeorm';

const mockExperimentRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    findOneByOrFail: jest.fn(),
});

const mockAssignmentRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
});

describe('ExperimentsService', () => {
    let service: ExperimentsService;
    let experimentRepository: Repository<ExperimentEntity>;
    let assignmentRepository: Repository<ExperimentAssignmentEntity>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExperimentsService,
                {
                    provide: getRepositoryToken(ExperimentEntity),
                    useFactory: mockExperimentRepository,
                },
                {
                    provide: getRepositoryToken(ExperimentAssignmentEntity),
                    useFactory: mockAssignmentRepository,
                },
            ],
        }).compile();

        service = module.get<ExperimentsService>(ExperimentsService);
        experimentRepository = module.get(getRepositoryToken(ExperimentEntity));
        assignmentRepository = module.get(getRepositoryToken(ExperimentAssignmentEntity));
    });

    describe('getVariant', () => {
        it('should return null if experiment does not exist', async () => {
            jest.spyOn(experimentRepository, 'findOne').mockResolvedValue(null);
            const result = await service.getVariant('non-existent', 'user1');
            expect(result).toBeNull();
        });

        it('should return null if experiment is not active', async () => {
            const experiment = {
                id: 'exp1',
                name: 'test-exp',
                status: ExperimentStatus.INACTIVE,
                variants: ['A', 'B'],
            } as ExperimentEntity;
            jest.spyOn(experimentRepository, 'findOne').mockResolvedValue(experiment);
            const result = await service.getVariant('test-exp', 'user1');
            expect(result).toBeNull();
        });

        it('should return existing assignment if found', async () => {
            const experiment = {
                id: 'exp1',
                name: 'test-exp',
                status: ExperimentStatus.ACTIVE,
                variants: ['A', 'B'],
            } as ExperimentEntity;
            const assignment = {
                experimentId: 'exp1',
                userId: 'user1',
                variant: 'A',
            } as ExperimentAssignmentEntity;

            jest.spyOn(experimentRepository, 'findOne').mockResolvedValue(experiment);
            jest.spyOn(assignmentRepository, 'findOne').mockResolvedValue(assignment);

            const result = await service.getVariant('test-exp', 'user1');
            expect(result).toBe('A');
        });

        it('should deterministically assign a variant if no assignment exists', async () => {
            const experiment = {
                id: 'exp1',
                name: 'test-exp',
                status: ExperimentStatus.ACTIVE,
                variants: ['A', 'B'],
            } as ExperimentEntity;

            jest.spyOn(experimentRepository, 'findOne').mockResolvedValue(experiment);
            jest.spyOn(assignmentRepository, 'findOne').mockResolvedValue(null);
            jest.spyOn(assignmentRepository, 'create').mockImplementation((dto) => dto as any);
            jest.spyOn(assignmentRepository, 'save').mockResolvedValue({} as any);

            const result1 = await service.getVariant('test-exp', 'user1');
            expect(assignmentRepository.save).toHaveBeenCalled();

            // we can't easily check the exact hash in a unit test without replicating the logic,
            // but we can verify it returns one of the variants.
            expect(['A', 'B']).toContain(result1);
        });
    });
});
