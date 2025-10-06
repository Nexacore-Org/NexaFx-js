import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Dispute } from './dispute.entity';

export enum AuthorType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

@Entity('comments')
@Index(['disputeId'])
@Index(['authorId'])
@Index(['createdAt'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  disputeId: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column()
  authorId: string;

  @Column({ type: 'enum', enum: AuthorType })
  authorType: AuthorType;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: false })
  isInternal: boolean; // Internal notes not visible to user

  @ManyToOne(() => Comment, (comment) => comment.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentCommentId' })
  parent: Comment;

  @OneToMany(() => Comment, (comment) => comment.parent)
  children: Comment[];

  @Column({ default: false })
  isEdited: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
