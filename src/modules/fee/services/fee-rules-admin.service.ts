import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeRuleEntity } from '../entities/fee-rule.entity';
import { CreateFeeRuleDto } from '../dto/create-fee-rule.dto';
import { UpdateFeeRuleDto } from '../dto/update-fee-rule.dto';

@Injectable()
export class FeeRulesAdminService {
  constructor(
    @InjectRepository(FeeRuleEntity)
    private readonly ruleRepo: Repository<FeeRuleEntity>,
  ) {}

  async create(dto: CreateFeeRuleDto): Promise<FeeRuleEntity> {
    const rule = this.ruleRepo.create(dto);
    return this.ruleRepo.save(rule);
  }

  async findAll(): Promise<FeeRuleEntity[]> {
    return this.ruleRepo.find({ order: { priority: 'ASC' } });
  }

  async findOne(id: string): Promise<FeeRuleEntity> {
    const rule = await this.ruleRepo.findOneBy({ id });
    if (!rule) throw new NotFoundException(`Fee rule ${id} not found`);
    return rule;
  }

  async update(id: string, dto: UpdateFeeRuleDto): Promise<FeeRuleEntity> {
    const rule = await this.findOne(id);
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async disable(id: string): Promise<FeeRuleEntity> {
    const rule = await this.findOne(id);
    rule.isActive = false;
    return this.ruleRepo.save(rule);
  }
}
