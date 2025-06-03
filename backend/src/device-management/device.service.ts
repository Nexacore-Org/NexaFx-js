import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { DeviceResponseDto } from './dto/device-response.dto';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
  ) {}

  async createDevice(createDeviceDto: CreateDeviceDto): Promise<DeviceResponseDto> {
    // Check if device already exists for this user with same user agent and IP
    const existingDevice = await this.deviceRepository.findOne({
      where: {
        userId: createDeviceDto.userId,
        userAgent: createDeviceDto.userAgent,
        ipAddress: createDeviceDto.ipAddress,
      },
    });

    if (existingDevice) {
      // Update last used time and return existing device
      existingDevice.lastUsedAt = new Date();
      existingDevice.isActive = true;
      await this.deviceRepository.save(existingDevice);
      return this.mapToResponseDto(existingDevice);
    }

    // Create new device
    const device = this.deviceRepository.create({
      ...createDeviceDto,
      lastUsedAt: new Date(),
      deviceType: this.detectDeviceType(createDeviceDto.userAgent),
    });

    const savedDevice = await this.deviceRepository.save(device);
    return this.mapToResponseDto(savedDevice);
  }

  async getUserDevices(userId: string): Promise<DeviceResponseDto[]> {
    const devices = await this.deviceRepository.find({
      where: { userId, isActive: true },
      order: { lastUsedAt: 'DESC' },
    });

    return devices.map(device => this.mapToResponseDto(device));
  }

  async revokeDevice(deviceId: string, userId: string): Promise<void> {
    const device = await this.deviceRepository.findOne({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new ForbiddenException('You can only revoke your own devices');
    }

    device.isActive = false;
    await this.deviceRepository.save(device);
  }

  async revokeAllDevices(userId: string, exceptDeviceId?: string): Promise<void> {
    const queryBuilder = this.deviceRepository
      .createQueryBuilder()
      .update(Device)
      .set({ isActive: false })
      .where('userId = :userId', { userId });

    if (exceptDeviceId) {
      queryBuilder.andWhere('id != :exceptDeviceId', { exceptDeviceId });
    }

    await queryBuilder.execute();
  }

  async updateDeviceUsage(userId: string, userAgent: string, ipAddress: string): Promise<void> {
    await this.deviceRepository.update(
      { userId, userAgent, ipAddress, isActive: true },
      { lastUsedAt: new Date() },
    );
  }

  private detectDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }

  private mapToResponseDto(device: Device): DeviceResponseDto {
    return {
      id: device.id,
      userId: device.userId,
      userAgent: device.userAgent,
      ipAddress: device.ipAddress,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      isActive: device.isActive,
      lastUsedAt: device.lastUsedAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}
