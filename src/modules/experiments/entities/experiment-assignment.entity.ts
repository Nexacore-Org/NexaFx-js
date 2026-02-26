import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';

@Entity('experiment_assignments')
@Index(['experimentId', 'userId'], { unique: true })
export class ExperimentAssignmentEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    experimentId: string;

    @Column()
    userId: string;

    @Column()
    variant: string;

    @CreateDateColumn()
    createdAt: Date;
}
