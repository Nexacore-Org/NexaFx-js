import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Beneficiary } from './beneficiary.entity';

export interface CreateBeneficiaryDto {
  userId: string;
  alias: string;
  address: string;
  currency: string;
  network?: string;
}

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepo: Repository<Beneficiary>,
  ) {}

  async create(dto: CreateBeneficiaryDto): Promise<Beneficiary> {
    const beneficiary = this.beneficiaryRepo.create(dto);
    return this.beneficiaryRepo.save(beneficiary);
  }

  async findAll(userId: string): Promise<Beneficiary[]> {
    return this.beneficiaryRepo.find({
      where: { userId },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<Beneficiary> {
    const beneficiary = await this.beneficiaryRepo.findOne({ where: { id, userId } });
    if (!beneficiary) throw new NotFoundException('Beneficiary not found');
    return beneficiary;
  }

  async update(id: string, userId: string, dto: Partial<CreateBeneficiaryDto>): Promise<Beneficiary> {
    const beneficiary = await this.findById(id, userId);
    Object.assign(beneficiary, dto);
    return this.beneficiaryRepo.save(beneficiary);
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.beneficiaryRepo.delete({ id, userId });
    if (result.affected === 0) throw new NotFoundException('Beneficiary not found');
  }

  async updateLastUsed(id: string, userId: string): Promise<void> {
    await this.beneficiaryRepo.update({ id, userId }, { lastUsedAt: new Date() });
  }

  async findByAddressAndCurrency(userId: string, address: string, currency: string): Promise<Beneficiary | null> {
    return this.beneficiaryRepo.findOne({ where: { userId, address, currency } });
  }
}
