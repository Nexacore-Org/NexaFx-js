import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketEntity, TicketStatus } from '../entities/support-ticket.entity';
import { TicketMessageEntity } from '../entities/ticket-message.entity';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { ListSupportTicketsDto } from '../dto/list-support-tickets.dto';

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepo: Repository<SupportTicketEntity>,
    @InjectRepository(TicketMessageEntity)
    private readonly messageRepo: Repository<TicketMessageEntity>,
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

    if (dto.status) {
      qb.andWhere('t.status = :status', { status: dto.status });
    }

    if (dto.assignedTo) {
      qb.andWhere('t.assignedTo = :assignedTo', { assignedTo: dto.assignedTo });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
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

  async assign(id: string, assignedTo: string, status?: TicketStatus, actorId?: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (actorId && ticket.userId !== actorId && ticket.assignedTo !== actorId) {
      throw new ForbiddenException('Access denied');
    }
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    ticket.assignedTo = assignedTo;
    if (status) {
      ticket.status = status;
    } else if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }
    return this.ticketRepo.save(ticket);
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
