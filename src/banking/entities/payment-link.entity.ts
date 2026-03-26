@Entity('payment_links')
export class PaymentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  ownerId: string;

  @Column('decimal')
  amount: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  maxUses?: number;

  @Column({ default: 0 })
  uses: number;

  @Column({ nullable: true })
  expiresAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}