import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("encryption_keys")
export class EncryptionKey {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "text" })
  value: string

  @Column({ unique: true })
  version: number

  @Column({ default: true })
  isActive: boolean

  @Column({ nullable: true })
  description?: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @Column({ nullable: true })
  rotatedAt?: Date
}
