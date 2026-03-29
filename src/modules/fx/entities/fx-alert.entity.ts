import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class FxAlert {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  currencyPair: string; // e.g. USD/NGN

  @Column("decimal")
  threshold: number;

  @Column({ type: "enum", enum: ["above", "below"] })
  direction: "above" | "below";

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
