import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ticket_messages')
@Index('idx_ticket_messages_ticket_id', ['ticketId'])
@Index('idx_ticket_messages_sender_id', ['senderId'])
export class TicketMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ticketId: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
