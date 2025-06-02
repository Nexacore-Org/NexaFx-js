import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { IpWhitelist } from './ip-whitelist.entity';
import { CreateIpWhitelistDto, UpdateIpWhitelistDto, IpWhitelistResponseDto } from './ip-whitelist.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IpWhitelistService {
  private readonly logger = new Logger(IpWhitelistService.name);
  private ipWhitelist: Map<string, IpWhitelist> = new Map();

  constructor() {
    // Initialize with default admin IP (localhost)
    this.seedDefaultIps();
  }

  private seedDefaultIps(): void {
    const defaultIps = [
      '127.0.0.1',
      '::1', // IPv6 localhost
      '0.0.0.0', // For development
    ];

    defaultIps.forEach(ip => {
      const id = uuidv4();
      this.ipWhitelist.set(id, {
        id,
        ipAddress: ip,
        description: 'Default system IP',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      });
    });
  }

  async findAll(): Promise<IpWhitelistResponseDto[]> {
    const ipList = Array.from(this.ipWhitelist.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    this.logger.log(`Retrieved ${ipList.length} IP whitelist entries`);
    return ipList;
  }

  async findById(id: string): Promise<IpWhitelistResponseDto> {
    const ipEntry = this.ipWhitelist.get(id);
    if (!ipEntry) {
      throw new NotFoundException(`IP whitelist entry with ID ${id} not found`);
    }
    return ipEntry;
  }

  async create(createDto: CreateIpWhitelistDto): Promise<IpWhitelistResponseDto> {
    // Check if IP already exists
    const existingIp = Array.from(this.ipWhitelist.values())
      .find(entry => entry.ipAddress === createDto.ipAddress);
    
    if (existingIp) {
      throw new ConflictException(`IP address ${createDto.ipAddress} is already whitelisted`);
    }

    const id = uuidv4();
    const newIpEntry: IpWhitelist = {
      id,
      ipAddress: createDto.ipAddress,
      description: createDto.description,
      isActive: createDto.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: createDto.createdBy,
    };

    this.ipWhitelist.set(id, newIpEntry);
    this.logger.log(`Added IP ${createDto.ipAddress} to whitelist with ID ${id}`);
    
    return newIpEntry;
  }

  async update(id: string, updateDto: UpdateIpWhitelistDto): Promise<IpWhitelistResponseDto> {
    const existingEntry = this.ipWhitelist.get(id);
    if (!existingEntry) {
      throw new NotFoundException(`IP whitelist entry with ID ${id} not found`);
    }

    const updatedEntry: IpWhitelist = {
      ...existingEntry,
      ...updateDto,
      updatedAt: new Date(),
    };

    this.ipWhitelist.set(id, updatedEntry);
    this.logger.log(`Updated IP whitelist entry ${id}`);
    
    return updatedEntry;
  }

  async delete(id: string): Promise<void> {
    const existingEntry = this.ipWhitelist.get(id);
    if (!existingEntry) {
      throw new NotFoundException(`IP whitelist entry with ID ${id} not found`);
    }

    // Prevent deletion of system IPs
    if (existingEntry.createdBy === 'system') {
      throw new ConflictException('Cannot delete system default IP addresses');
    }

    this.ipWhitelist.delete(id);
    this.logger.log(`Deleted IP whitelist entry ${id} (${existingEntry.ipAddress})`);
  }

  async isIpWhitelisted(ipAddress: string): Promise<boolean> {
    const whitelistedIps = Array.from(this.ipWhitelist.values())
      .filter(entry => entry.isActive)
      .map(entry => entry.ipAddress);

    const isWhitelisted = whitelistedIps.includes(ipAddress);
    this.logger.debug(`IP ${ipAddress} whitelist check: ${isWhitelisted ? 'ALLOWED' : 'BLOCKED'}`);
    
    return isWhitelisted;
  }

  async getActiveIps(): Promise<string[]> {
    return Array.from(this.ipWhitelist.values())
      .filter(entry => entry.isActive)
      .map(entry => entry.ipAddress);
  }

  // Utility method for bulk operations
  async bulkCreate(ipAddresses: string[], createdBy?: string): Promise<IpWhitelistResponseDto[]> {
    const results: IpWhitelistResponseDto[] = [];
    
    for (const ip of ipAddresses) {
      try {
        const result = await this.create({
          ipAddress: ip,
          description: `Bulk imported IP`,
          isActive: true,
          createdBy,
        });
        results.push(result);
      } catch (error) {
        this.logger.warn(`Failed to add IP ${ip}: ${error.message}`);
      }
    }
    
    return results;
  }
}
