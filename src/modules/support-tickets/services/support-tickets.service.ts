import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  SupportTicketEntity,
  TicketStatus,
} from '../entities/support-ticket.entity';
import { TicketMessageEntity } from '../entities/ticket-message.entity';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';
import { ListTicketMessagesDto } from '../dto/list-ticket-messages.dto';
import { MAX_TICKET_MESSAGE_LENGTH } from '../dto/create-ticket-message.dto';
import {
  LegacySupportTicketEvents,
  SupportTicketAssignedEvent,
  SupportTicketCreatedEvent,
  SupportTicketEvents,
  SupportTicketStatusChangedEvent,
} from '../support-ticket.events';
import { UsersService } from '../../../users/users.service';
import { UserRole } from '../../../users/user.entity';

export const MAX_MESSAGES_PER_TICKET = 500;
export const REOPEN_WINDOW_DAYS = 7;

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.WAITING_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.WAITING_CUSTOMER]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepo: Repository<SupportTicketEntity>,
    @InjectRepository(TicketMessageEntity)
    private readonly messageRepo: Repository<TicketMessageEntity>,
    private readonly usersService: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    userId: string,
    dto: CreateSupportTicketDto,
  ): Promise<SupportTicketEntity> {
    const ticket = this.ticketRepo.create({
      userId,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority ?? 'medium',
      status: TicketStatus.OPEN,
    });
    const saved = await this.ticketRepo.save(ticket);
    const payload: SupportTicketCreatedEvent = {
      ticketId: saved.id,
      userId,
      subject: dto.subject,
      priority: saved.priority,
    };
    this.events.emit(SupportTicketEvents.CREATED, payload);
    this.events.emit(LegacySupportTicketEvents.CREATED, payload);
    return saved;
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
    actorId?: string,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException(
        'Closed tickets must be reopened before reassignment',
      );
    }

    const agent = await this.usersService.findByIdOrNull(assignedTo);
    if (
      !agent ||
      (agent.role !== UserRole.ADMIN && agent.role !== UserRole.COMPLIANCE)
    ) {
      throw new BadRequestException(
        'Tickets can only be assigned to a staff member',
      );
    }

    const from = ticket.status;
    if (status) {
      this.assertTransition(ticket.status, status);
      ticket.status = status;
      ticket.resolvedAt =
        status === TicketStatus.RESOLVED ? new Date() : ticket.resolvedAt;
      if (status === TicketStatus.OPEN || status === TicketStatus.IN_PROGRESS) {
        ticket.resolvedAt = undefined;
      }
    } else if (ticket.status === TicketStatus.OPEN) {
      ticket.status = TicketStatus.IN_PROGRESS;
    }

    ticket.assignedTo = assignedTo;
    const saved = await this.ticketRepo.save(ticket);
    const payload: SupportTicketAssignedEvent = {
      ticketId: id,
      assignedTo,
      actorId,
    };
    this.events.emit(SupportTicketEvents.ASSIGNED, payload);
    if (from !== saved.status) {
      this.emitStatusChanged(id, ticket.userId, from, saved.status, actorId);
    } else {
      this.events.emit(LegacySupportTicketEvents.UPDATED, payload);
    }
    return saved;
  }

  async changeStatus(
    id: string,
    status: TicketStatus,
    actorId?: string,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    const from = ticket.status;
    this.assertTransition(from, status);
    ticket.status = status;
    ticket.resolvedAt =
      status === TicketStatus.RESOLVED ? new Date() : ticket.resolvedAt;
    if (status === TicketStatus.OPEN || status === TicketStatus.IN_PROGRESS) {
      ticket.resolvedAt = undefined;
    }
    const saved = await this.ticketRepo.save(ticket);
    this.emitStatusChanged(id, ticket.userId, from, status, actorId);
    return saved;
  }

  async reopen(id: string, actorId?: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.status !== TicketStatus.CLOSED) {
      throw new BadRequestException('Only closed tickets can be reopened');
    }
    const anchor = ticket.resolvedAt ?? ticket.updatedAt ?? ticket.createdAt;
    const deadline = Date.now() - REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (!anchor || new Date(anchor).getTime() < deadline) {
      throw new BadRequestException(
        `Closed tickets can only be reopened within ${REOPEN_WINDOW_DAYS} days`,
      );
    }
    ticket.status = TicketStatus.OPEN;
    ticket.resolvedAt = undefined;
    const saved = await this.ticketRepo.save(ticket);
    this.emitStatusChanged(
      id,
      ticket.userId,
      TicketStatus.CLOSED,
      TicketStatus.OPEN,
      actorId,
    );
    return saved;
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
    if (ticket.status !== TicketStatus.CLOSED) {
      const from = ticket.status;
      this.assertTransition(ticket.status, TicketStatus.CLOSED);
      ticket.status = TicketStatus.CLOSED;
      await this.ticketRepo.save(ticket);
      this.emitStatusChanged(
        id,
        ticket.userId,
        from,
        TicketStatus.CLOSED,
        userId,
      );
    }
    return ticket;
  }

  private assertTransition(from: TicketStatus, to: TicketStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(
        `Cannot move a ticket from ${from} to ${to}`,
      );
    }
  }

  private emitStatusChanged(
    ticketId: string,
    userId: string,
    from: string,
    to: string,
    actorId?: string,
  ): void {
    const payload: SupportTicketStatusChangedEvent = {
      ticketId,
      userId,
      from,
      to,
      actorId,
    };
    this.events.emit(SupportTicketEvents.STATUS_CHANGED, payload);
    this.events.emit(LegacySupportTicketEvents.UPDATED, payload);
  }

  private async assertTicketAccess(
    ticketId: string,
    userId: string,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.userId !== userId && ticket.assignedTo !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return ticket;
  }

  async addMessage(
    ticketId: string,
    senderId: string,
    message: string,
  ): Promise<TicketMessageEntity> {
    await this.assertTicketAccess(ticketId, senderId);

    const body = typeof message === 'string' ? message.trim() : '';
    if (!body || body.length > MAX_TICKET_MESSAGE_LENGTH) {
      throw new BadRequestException(
        'Message must be between 1 and 5000 characters',
      );
    }
    const count = await this.messageRepo.count({ where: { ticketId } });
    if (count >= MAX_MESSAGES_PER_TICKET) {
      throw new BadRequestException(
        'This ticket has reached its message limit',
      );
    }
    const msg = this.messageRepo.create({ ticketId, senderId, message: body });
    return this.messageRepo.save(msg);
  }

  async getMessages(
    ticketId: string,
    userId: string,
    dto: ListTicketMessagesDto = {},
  ): Promise<{
    data: TicketMessageEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.assertTicketAccess(ticketId, userId);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const [data, total] = await this.messageRepo.findAndCount({
      where: { ticketId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
