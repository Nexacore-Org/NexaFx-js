import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BeneficiaryEntity } from '../entities/beneficiary.entity';
import { CreateBeneficiaryDto, UpdateBeneficiaryDto } from '../dto/beneficiary.dto';
import { WalletAliasService } from '../../transactions/services/wallet-alias.service';

const FIRST_SEND_THRESHOLD = 0; // warn on any send to non-beneficiary address

@Injectable()
export class BeneficiaryService {
  constructor(
    @InjectRepository(BeneficiaryEntity)
    private readonly beneficiaryRepo: Repository<BeneficiaryEntity>,
    private readonly walletAliasService: WalletAliasService,
  ) {}

  async create(userId: string, dto: CreateBeneficiaryDto): Promise<BeneficiaryEntity> {
    const existing = await this.beneficiaryRepo.findOne({
      where: { userId, address: dto.address },
    });
    if (existing) throw new ConflictException('Beneficiary with this address already exists');

    const beneficiary = this.beneficiaryRepo.create({
      userId,
      address: dto.address,
      alias: dto.alias,
      metadata: dto.metadata ?? null,
      requiresVerification: false,
      verifiedAt: new Date(),
    });

    const saved = await this.beneficiaryRepo.save(beneficiary);

    // Also register in wallet alias service for display enrichment
    await this.walletAliasService.create(userId, {
      walletAddress: dto.address,
      alias: dto.alias,
      metadata: dto.metadata,
    }).catch(() => {}); // ignore if alias already exists

    return saved;
  }

  async findAll(userId: string): Promise<BeneficiaryEntity[]> {
    return this.beneficiaryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<BeneficiaryEntity> {
    const b = await this.beneficiaryRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('Beneficiary not found');
    if (b.userId !== userId) throw new ForbiddenException();
    return b;
  }

  async update(id: string, userId: string, dto: UpdateBeneficiaryDto): Promise<BeneficiaryEntity> {
    const b = await this.findOne(id, userId);

    if (dto.address && dto.address !== b.address) {
      // Address changed — require re-verification
      b.address = dto.address;
      b.requiresVerification = true;
      b.verifiedAt = null;
    }

    if (dto.alias !== undefined) b.alias = dto.alias;
    if (dto.metadata !== undefined) b.metadata = dto.metadata;

    return this.beneficiaryRepo.save(b);
  }

  async remove(id: string, userId: string): Promise<void> {
    const b = await this.findOne(id, userId);
    await this.beneficiaryRepo.remove(b);
  }

  /** Returns true if the address is a known beneficiary for the user */
  async isBeneficiary(userId: string, address: string): Promise<boolean> {
    const b = await this.beneficiaryRepo.findOne({
      where: { userId, address, requiresVerification: false },
    });
    return !!b;
  }
}
