import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from './support-ticket.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

export interface CreateSupportTicketDto {
  userId: string;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface UpdateSupportTicketDto {
  status: SupportTicketStatus;
  adminId: string;
}

@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly events: EventEmitter2,
  ) {}

  async createTicket(dto: CreateSupportTicketDto): Promise<SupportTicket> {
    const ticket = this.supportTicketRepository.create({
      ...dto,
      status: SupportTicketStatus.OPEN,
      relatedEntityType: dto.relatedEntityType ?? null,
      relatedEntityId: dto.relatedEntityId ?? null,
    });
    const saved = await this.supportTicketRepository.save(ticket);
    const user = await this.usersService.findById(dto.userId);

    this.events.emit('support.ticket.created', saved);
    this.mailService.sendSupportTicketCreatedEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`,
      ticketId: saved.id,
      subject: saved.subject,
      category: saved.category,
    });

    return saved;
  }

  async listTickets(
    userId: string,
    isAdmin: boolean,
  ): Promise<SupportTicket[]> {
    if (isAdmin) {
      return this.supportTicketRepository.find({
        order: { createdAt: 'DESC' },
      });
    }

    return this.supportTicketRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateTicket(
    id: string,
    dto: UpdateSupportTicketDto,
  ): Promise<SupportTicket> {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException(`Support ticket ${id} not found`);
    }

    ticket.status = dto.status;
    ticket.updatedBy = dto.adminId;
    ticket.resolvedAt =
      dto.status === SupportTicketStatus.RESOLVED ||
      dto.status === SupportTicketStatus.CLOSED
        ? new Date()
        : (ticket.resolvedAt ?? null);

    const saved = await this.supportTicketRepository.save(ticket);
    const user = await this.usersService.findById(ticket.userId);

    this.events.emit('support.ticket.updated', saved);
    this.mailService.sendSupportTicketStatusUpdateEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`,
      ticketId: saved.id,
      status: saved.status,
    });

    return saved;
  }
}
