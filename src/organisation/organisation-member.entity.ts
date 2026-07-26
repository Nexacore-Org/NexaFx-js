import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum OrgMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('organisation_members')
@Index(['organisationId', 'userId'], { unique: true })
@Index(['organisationId'])
export class OrganisationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organisationId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: OrgMemberRole, default: OrgMemberRole.MEMBER })
  role: OrgMemberRole;

  @Column({ type: 'simple-array', nullable: true })
  permissions: string[] | null;

  @CreateDateColumn()
  joinedAt: Date;
}