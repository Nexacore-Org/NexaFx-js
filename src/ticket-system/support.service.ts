import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { SupportMessage } from './entities/support-message.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { UpdateSupportTicketDto } from './dto/update-support-ticket.dto';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { QuerySupportTicketsDto } from './dto/query-support-tickets.dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepository: Repository<SupportTicket>,
    @InjectRepository(SupportMessage)
    private readonly messageRepository: Repository<SupportMessage>,
  ) {}

  async createTicket(
    userId: string,
    createTicketDto: CreateSupportTicketDto,
  ): Promise<SupportTicket> {
    const ticket = this.ticketRepository.create({
      ...createTicketDto,
      userId,
    });

    return this.ticketRepository.save(ticket);
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
}