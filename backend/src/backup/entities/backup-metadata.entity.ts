import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("backup_metadata")
export class BackupMetadata {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column()
  type: string 

  @Column()
  status: string 

  @Column({ nullable: true })
  filePath: string

  @Column({ type: "bigint", nullable: true })
  fileSize: number

  @Column({ nullable: true })
  checksum: string

  @Column({ type: "jsonb", nullable: true })
  storageLocations: any[]

  @Column({ default: false })
  encrypted: boolean

  @Column({ nullable: true })
  retentionTag: string 

  @Column({ nullable: true })
  triggeredBy: string

  @Column({ type: "timestamp", nullable: true })
  startedAt: Date

  @Column({ type: "timestamp", nullable: true })
  completedAt: Date

  @Column({ type: "timestamp", nullable: true })
  lastVerifiedAt: Date

  @Column({ type: "text", nullable: true })
  errorMessage: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
