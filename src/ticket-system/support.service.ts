import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus, TicketPriority } from './entities/support-ticket.entity';
import { SupportMessage } from './entities/support-message.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { QuerySupportTicketsDto } from './dto/query-support-tickets.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

const SLA_HOURS: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 1,
  [TicketPriority.HIGH]: 4,
  [TicketPriority.MEDIUM]: 24,
  [TicketPriority.LOW]: 72,
};

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepository: Repository<SupportTicket>,
    @InjectRepository(SupportMessage)
    private readonly messageRepository: Repository<SupportMessage>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createTicket(
    userId: string,
    createTicketDto: CreateSupportTicketDto,
  ): Promise<SupportTicket> {
    const priority = createTicketDto.priority ?? TicketPriority.MEDIUM;
    const slaHours = SLA_HOURS[priority];
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const ticket = this.ticketRepository.create({
      ...createTicketDto,
      userId,
      slaDeadline,
      isEscalated: false,
    });

    const saved = await this.ticketRepository.save(ticket);
    this.eventEmitter.emit('support.ticket.created', { ticket: saved });
    return saved;
  }

  async getUserTickets(
    userId: string,
    query: QuerySupportTicketsDto,
  ): Promise<{ tickets: SupportTicket[]; total: number }> {
    const { status, priority, category, limit = '10', offset = '0' } = query;

    const queryBuilder = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.messages', 'messages')
      .where('ticket.userId = :userId', { userId })
      .orderBy('ticket.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('ticket.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('ticket.priority = :priority', { priority });
    }

    if (category) {
      queryBuilder.andWhere('ticket.category = :category', { category });
    }

    const total = await queryBuilder.getCount();
    const tickets = await queryBuilder
      .skip(parseInt(offset))
      .take(parseInt(limit))
      .getMany();

    return { tickets, total };
  }

  async getAllTickets(
    query: QuerySupportTicketsDto,
  ): Promise<{ tickets: SupportTicket[]; total: number }> {
    const { status, priority, category, limit = '10', offset = '0' } = query;

    const queryBuilder = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.messages', 'messages')
      .orderBy('ticket.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('ticket.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('ticket.priority = :priority', { priority });
    }

    if (category) {
      queryBuilder.andWhere('ticket.category = :category', { category });
    }

    const total = await queryBuilder.getCount();
    const tickets = await queryBuilder
      .skip(parseInt(offset))
      .take(parseInt(limit))
      .getMany();

    return { tickets, total };
  }

  async getTicketById(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['messages', 'messages.author'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    // Filter out internal messages for regular users
    ticket.messages = ticket.messages.filter(msg => !msg.isInternal);

    return ticket;
  }

  async getTicketByIdAdmin(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['messages', 'messages.author', 'user', 'assignedTo'],
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async addMessage(
    ticketId: string,
    userId: string,
    createMessageDto: CreateSupportMessageDto,
  ): Promise<SupportMessage> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.userId !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('Cannot add messages to a closed ticket');
    }

    // Regular users cannot create internal messages
    const message = this.messageRepository.create({
      ...createMessageDto,
      ticketId,
      authorId: userId,
      isInternal: false,
    });

    // Update ticket status to pending if it was resolved
    if (ticket.status === TicketStatus.RESOLVED) {
      ticket.status = TicketStatus.PENDING;
      await this.ticketRepository.save(ticket);
    }

    return this.messageRepository.save(message);
  }

  async addMessageAdmin(
    ticketId: string,
    adminId: string,
    createMessageDto: CreateSupportMessageDto,
  ): Promise<SupportMessage> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const message = this.messageRepository.create({
      ...createMessageDto,
      ticketId,
      authorId: adminId,
    });

    // Record first response time if this is the first admin reply
    if (!ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
      await this.ticketRepository.save(ticket);
    }

    return this.messageRepository.save(message);
  }

  async updateTicket(
    ticketId: string,
    updateTicketDto: UpdateSupportTicketDto,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Set closedAt timestamp when closing
    if (updateTicketDto.status === TicketStatus.CLOSED && ticket.status !== TicketStatus.CLOSED) {
      ticket.closedAt = new Date();
    }

    Object.assign(ticket, updateTicketDto);

    return this.ticketRepository.save(ticket);
  }

  async deleteTicket(ticketId: string): Promise<void> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    await this.ticketRepository.remove(ticket);
  }

  async getAnalytics(): Promise<{
    avgFirstResponseTimeMs: Record<string, number>;
    slaBreachRateByPriority: Record<string, number>;
  }> {
    // Average first response time per priority
    const firstResponseRaw = await this.ticketRepository
      .createQueryBuilder('t')
      .select('t.priority', 'priority')
      .addSelect(
        'AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) * 1000)',
        'avgMs',
      )
      .where('t.first_response_at IS NOT NULL')
      .groupBy('t.priority')
      .getRawMany<{ priority: string; avgMs: string }>();

    const avgFirstResponseTimeMs: Record<string, number> = {};
    for (const row of firstResponseRaw) {
      avgFirstResponseTimeMs[row.priority] = Math.round(parseFloat(row.avgMs));
    }

    // SLA breach rate = escalated tickets / total non-closed tickets per priority
    const breachRaw = await this.ticketRepository
      .createQueryBuilder('t')
      .select('t.priority', 'priority')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN t.is_escalated = true THEN 1 ELSE 0 END)', 'breached')
      .where('t.status NOT IN (:...statuses)', {
        statuses: [TicketStatus.CLOSED, TicketStatus.RESOLVED],
      })
      .groupBy('t.priority')
      .getRawMany<{ priority: string; total: string; breached: string }>();

    const slaBreachRateByPriority: Record<string, number> = {};
    for (const row of breachRaw) {
      const total = parseInt(row.total, 10);
      const breached = parseInt(row.breached, 10);
      slaBreachRateByPriority[row.priority] = total > 0 ? Math.round((breached / total) * 100 * 100) / 100 : 0;
    }

    return { avgFirstResponseTimeMs, slaBreachRateByPriority };
  }

  async escalateBreachedTickets(): Promise<number> {
    const now = new Date();
    const breachWindow = new Date(now.getTime() - 30 * 60 * 1000); // 30 min past SLA

    const result = await this.ticketRepository
      .createQueryBuilder()
      .update(SupportTicket)
      .set({ isEscalated: true })
      .where('sla_deadline IS NOT NULL')
      .andWhere('sla_deadline < :breachWindow', { breachWindow })
      .andWhere('is_escalated = false')
      .andWhere('status NOT IN (:...statuses)', {
        statuses: [TicketStatus.CLOSED, TicketStatus.RESOLVED],
      })
      .execute();

    return result.affected ?? 0;
  }
}