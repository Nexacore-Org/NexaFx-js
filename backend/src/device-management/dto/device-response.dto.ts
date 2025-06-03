export class DeviceResponseDto {
    id: string;
    userId: string;
    userAgent: string;
    ipAddress: string;
    deviceName?: string;
    deviceType?: string;
    isActive: boolean;
    lastUsedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }