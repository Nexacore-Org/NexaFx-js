import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FederationAddressEntity } from '../entities/federation-address.entity';

@Injectable()
export class StellarFederationService {
  constructor(
    @InjectRepository(FederationAddressEntity)
    private readonly federationRepo: Repository<FederationAddressEntity>,
  ) {}

  async createAddress(
    userId: string,
    data: { name: string; domain: string; stellarAddress: string; memo?: string; memoType?: string },
  ): Promise<FederationAddressEntity> {
    const existing = await this.federationRepo.findOne({
      where: { domain: data.domain, stellarAddress: data.stellarAddress, isActive: true },
    });

    if (existing) {
      throw new ConflictException('Federation address already exists for this domain and stellar address');
    }

    const address = this.federationRepo.create({
      userId,
      domain: data.domain,
      stellarAddress: data.stellarAddress,
      memo: data.memo,
      memoType: data.memoType,
      isActive: true,
    });

    return this.federationRepo.save(address);
  }

  async resolveAddress(query: string): Promise<FederationAddressEntity | null> {
    // Support user*domain.com format
    const starIndex = query.indexOf('*');
    if (starIndex === -1) {
      throw new NotFoundException('Invalid federation address format. Expected user*domain.com');
    }

    const name = query.substring(0, starIndex);
    const domain = query.substring(starIndex + 1);

    const address = await this.federationRepo.findOne({
      where: { domain, stellarAddress: name, isActive: true },
    });

    if (!address) {
      throw new NotFoundException('Federation address not found');
    }

    return address;
  }

  async getAddressesByUser(userId: string): Promise<FederationAddressEntity[]> {
    return this.federationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteAddress(id: string, userId: string): Promise<void> {
    const address = await this.federationRepo.findOne({
      where: { id, userId },
    });

    if (!address) {
      throw new NotFoundException('Federation address not found');
    }

    address.isActive = false;
    await this.federationRepo.save(address);
  }
}
