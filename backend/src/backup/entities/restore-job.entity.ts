import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("restore_jobs")
export class RestoreJob {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column()
  backupId: string

  @Column()
  targetDatabase: string

  @Column({ type: "timestamp", nullable: true })
  pointInTime: Date

  @Column()
  status: string 

  @Column({ nullable: true })
  initiatedBy: string

  @Column({ type: "timestamp", nullable: true })
  startedAt: Date

  @Column({ type: "timestamp", nullable: true })
  completedAt: Date

  @Column({ type: "text", nullable: true })
  errorMessage: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
