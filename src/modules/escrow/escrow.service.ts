import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { withTransaction } from '../../common/helpers/with-transaction.helper';
import { WalletsService } from '../../wallet/wallets.service';
import { EscrowHold, EscrowStatus } from './entities/escrow-hold.entity';
import { CreateEscrowDto } from './dto/create-escrow.dto';

export interface EscrowActor {
  id: string;
  role?: string;
}

/**
 * Holds funds between two parties. Money moves only through
 * `WalletsService.adjustBalance(..., manager)` inside one database transaction,
 * and a hold leaves HELD exactly once (a conditional UPDATE), so a second
 * release or refund - or a release racing a refund - is rejected with 409.
 */
@Injectable()
export class EscrowService {
  constructor(
    @InjectRepository(EscrowHold)
    private readonly holds: Repository<EscrowHold>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly wallets: WalletsService,
  ) {}

  /** Debit the payer and record a HELD hold, atomically. */
  async hold(payerId: string, dto: CreateEscrowDto): Promise<EscrowHold> {
    if (dto.payeeId === payerId) {
      throw new BadRequestException('You cannot hold funds for yourself');
    }
    const currency = dto.currency.toUpperCase();

    return withTransaction(this.dataSource, async (manager) => {
      // Throws "Insufficient balance" (400) if the payer cannot cover it.
      await this.wallets.adjustBalance(payerId, currency, -dto.amount, manager);

      const hold = manager.create(EscrowHold, {
        payerId,
        payeeId: dto.payeeId,
        amount: dto.amount,
        currency,
        status: EscrowStatus.HELD,
        releaseAfter: dto.releaseAfter ? new Date(dto.releaseAfter) : null,
        resolvedAt: null,
      });
      return manager.save(EscrowHold, hold);
    });
  }

  /** Pay the held funds to the payee. Only the payer may release. */
  async release(id: string, actor: EscrowActor): Promise<EscrowHold> {
    return this.resolve(id, EscrowStatus.RELEASED, (hold) => {
      if (hold.payerId !== actor.id) {
        throw new ForbiddenException('Only the payer can release escrowed funds');
      }
      return hold.payeeId;
    });
  }

  /** Return the held funds to the payer. The payee or an admin may refund. */
  async refund(id: string, actor: EscrowActor): Promise<EscrowHold> {
    return this.resolve(id, EscrowStatus.REFUNDED, (hold) => {
      if (hold.payeeId !== actor.id && actor.role !== 'admin') {
        throw new ForbiddenException('Only the payee or an admin can refund escrowed funds');
      }
      return hold.payerId;
    });
  }

  async listForUser(userId: string): Promise<EscrowHold[]> {
    return this.holds
      .createQueryBuilder('h')
      .where('h.payerId = :userId OR h.payeeId = :userId', { userId })
      .orderBy('h.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Shared transition: authorise, flip HELD -> `to` with a conditional UPDATE
   * (409 if it is no longer HELD), then credit the beneficiary - all in one transaction.
   */
  private async resolve(
    id: string,
    to: EscrowStatus.RELEASED | EscrowStatus.REFUNDED,
    authorise: (hold: EscrowHold) => string,
  ): Promise<EscrowHold> {
    return withTransaction(this.dataSource, async (manager) => {
      const hold = await manager.findOne(EscrowHold, { where: { id } });
      if (!hold) {
        throw new NotFoundException(`Escrow ${id} not found`);
      }
      const beneficiaryId = authorise(hold);

      const claimed = await manager.update(
        EscrowHold,
        { id, status: EscrowStatus.HELD },
        { status: to, resolvedAt: new Date() },
      );
      if (!claimed.affected) {
        throw new ConflictException(`Escrow is already ${hold.status.toLowerCase()}`);
      }

      await this.wallets.adjustBalance(beneficiaryId, hold.currency, Number(hold.amount), manager);

      return { ...hold, status: to, resolvedAt: new Date() } as EscrowHold;
    });
  }
}
