import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SupportTicketEntity, TicketStatus } from '../entities/support-ticket.entity';
import { TicketMessageEntity } from '../entities/ticket-message.entity';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { UsersService } from '../../../users/users.service';
import { UserRole } from '../../../users/user.entity';

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting_customer', 'resolved', 'closed'],
  in_progress: ['waiting_customer', 'resolved', 'closed'],
  waiting_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['open', 'in_progress', 'closed'],
  closed: ['open'],
};

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepo: Repository<SupportTicketEntity>,
    @InjectRepository(TicketMessageEntity)
    private readonly messageRepo: Repository<TicketMessageEntity>,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, dto: CreateSupportTicketDto): Promise<SupportTicketEntity> {
    const ticket = this.ticketRepo.create({
      userId,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority ?? 'medium',
      status: 'open',
    });
    return this.ticketRepo.save(ticket);
  }

  async findAll(userId: string, dto: ListSupportTicketsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId })
      .orderBy('t.createdAt', 'DESC');

    this.applyFilters(qb, dto);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /** Agent queue: every ticket, not just the caller's, filtered by the queue view. */
  async findAllForStaff(dto: ListSupportTicketsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC');

    this.applyFilters(qb, dto);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  private applyFilters(
    qb: SelectQueryBuilder<SupportTicketEntity>,
    dto: ListSupportTicketsDto,
  ): void {
    if (dto.status) {
      qb.andWhere('t.status = :status', { status: dto.status });
    }
    if (dto.assignedTo) {
      qb.andWhere('t.assignedTo = :assignedTo', { assignedTo: dto.assignedTo });
    }
    if (dto.priority) {
      qb.andWhere('t.priority = :priority', { priority: dto.priority });
    }
  }

  async findOne(id: string, userId: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return ticket;
  }

  async assign(
    id: string,
    assignedTo: string,
    status?: TicketStatus,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    const agent = await this.usersService.findByIdOrNull(assignedTo);
    if (!agent || (agent.role !== UserRole.ADMIN && agent.role !== UserRole.COMPLIANCE)) {
      throw new BadRequestException('Tickets can only be assigned to a staff member');
    }

    if (status) {
      this.assertTransition(ticket.status, status);
      ticket.status = status;
      ticket.resolvedAt = status === 'resolved' ? new Date() : ticket.resolvedAt;
      if (status === 'open' || status === 'in_progress') {
        ticket.resolvedAt = undefined;
      }
    } else if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    ticket.assignedTo = assignedTo;
    return this.ticketRepo.save(ticket);
  }

  /** The ticket owner may close their own ticket; no reassignment or status edits. */
  async close(id: string, userId: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (ticket.status !== 'closed') {
      this.assertTransition(ticket.status, 'closed');
      ticket.status = 'closed';
      await this.ticketRepo.save(ticket);
    }
    return ticket;
  }

  private assertTransition(from: TicketStatus, to: TicketStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move a ticket from ${from} to ${to}`);
    }
  }

  async addMessage(ticketId: string, senderId: string, message: string): Promise<TicketMessageEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.userId !== senderId && ticket.assignedTo !== senderId) {
      throw new ForbiddenException('Access denied');
    }
    const msg = this.messageRepo.create({ ticketId, senderId, message });
    return this.messageRepo.save(msg);
  }

  async getMessages(ticketId: string): Promise<TicketMessageEntity[]> {
    return this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }
}
