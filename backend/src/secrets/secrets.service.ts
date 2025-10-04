import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import {
  CreateSecretDto,
  UpdateSecretDto,
  RotateSecretDto,
  SecretResponseDto,
  PaginatedSecretsDto,
  FindAllSecretsDto,
} from './dto/secrets.dto';
import { Secret } from './entities/secret.entity';
import { NotificationService } from '../notifications/notifications.service';

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    @InjectRepository(Secret)
    private secretRepository: Repository<Secret>,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private notificationService: NotificationService,
  ) {}

  async findAll(params: FindAllSecretsDto): Promise<PaginatedSecretsDto> {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    const queryBuilder = this.secretRepository.createQueryBuilder('secret');

    if (search) {
      queryBuilder.where(
        'secret.name ILIKE :search OR secret.description ILIKE :search',
        { search: `%${search}%` },
      );
    }

    queryBuilder.orderBy('secret.updatedAt', 'DESC').skip(skip).take(limit);

    const [secrets, total] = await queryBuilder.getManyAndCount();

    return {
      data: secrets.map(this.toResponseDto),
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<SecretResponseDto> {
    const secret = await this.secretRepository.findOne({
      where: { id },
      relations: ['affectedServices'],
    });

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${id} not found`);
    }

    return this.toResponseDto(secret);
  }

  async create(createSecretDto: CreateSecretDto): Promise<SecretResponseDto> {
    // Check if secret with same name already exists
    const existingSecret = await this.secretRepository.findOne({
      where: { name: createSecretDto.name },
    });

    if (existingSecret) {
      throw new BadRequestException(
        `Secret with name "${createSecretDto.name}" already exists`,
      );
    }

    const secret = this.secretRepository.create({
      ...createSecretDto,
      value: await this.encryptValue(createSecretDto.value),
      lastRotatedAt: new Date(),
    });

    const savedSecret = await this.secretRepository.save(secret);

    this.logger.log(
      `Secret created: ${savedSecret.name} (ID: ${savedSecret.id})`,
    );

    // Emit event for audit logging
    this.eventEmitter.emit('secret.created', {
      secretId: savedSecret.id,
      secretName: savedSecret.name,
      timestamp: new Date(),
    });

    return this.toResponseDto(savedSecret);
  }

  async update(
    id: string,
    updateSecretDto: UpdateSecretDto,
  ): Promise<SecretResponseDto> {
    const secret = await this.findSecretById(id);

    // If updating value, encrypt it
    if (updateSecretDto.value) {
      updateSecretDto.value = await this.encryptValue(updateSecretDto.value);
    }

    Object.assign(secret, updateSecretDto);
    const updatedSecret = await this.secretRepository.save(secret);

    this.logger.log(
      `Secret updated: ${updatedSecret.name} (ID: ${updatedSecret.id})`,
    );

    this.eventEmitter.emit('secret.updated', {
      secretId: updatedSecret.id,
      secretName: updatedSecret.name,
      timestamp: new Date(),
    });

    return this.toResponseDto(updatedSecret);
  }

  async remove(id: string): Promise<void> {
    const secret = await this.findSecretById(id);

    await this.secretRepository.remove(secret);

    this.logger.log(`Secret deleted: ${secret.name} (ID: ${secret.id})`);

    this.eventEmitter.emit('secret.deleted', {
      secretId: secret.id,
      secretName: secret.name,
      timestamp: new Date(),
    });
  }

  async rotate(
    id: string,
    rotateSecretDto: RotateSecretDto,
  ): Promise<SecretResponseDto> {
    const secret = await this.findSecretById(id);

    // Store old value for rollback if needed
    const oldValue = secret.value;
    const oldRotationDate = secret.lastRotatedAt;

    try {
      // Generate new secret value
      const newValue =
        rotateSecretDto.newValue || this.generateSecretValue(secret.type);

      // Update secret
      secret.value = await this.encryptValue(newValue);
      secret.lastRotatedAt = new Date();
      secret.rotationCount = (secret.rotationCount || 0) + 1;

      const updatedSecret = await this.secretRepository.save(secret);

      this.logger.log(
        `Secret rotated: ${updatedSecret.name} (ID: ${updatedSecret.id})`,
      );

      // Notify affected services if requested
      if (rotateSecretDto.notifyServices !== false) {
        await this.notifyAffectedServices(updatedSecret, newValue);
      }

      // Emit rotation event
      this.eventEmitter.emit('secret.rotated', {
        secretId: updatedSecret.id,
        secretName: updatedSecret.name,
        timestamp: new Date(),
        notifyServices: rotateSecretDto.notifyServices !== false,
      });

      return this.toResponseDto(updatedSecret);
    } catch (error) {
      this.logger.error(
        `Failed to rotate secret ${secret.name}: ${error.message}`,
      );

      // Rollback on failure
      secret.value = oldValue;
      secret.lastRotatedAt = oldRotationDate;
      await this.secretRepository.save(secret);

      throw error;
    }
  }

  async bulkRotate(
    secretIds: string[],
    notifyServices = true,
  ): Promise<SecretResponseDto[]> {
    const results: SecretResponseDto[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of secretIds) {
      try {
        const result = await this.rotate(id, { notifyServices });
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to rotate secret ${id}: ${error.message}`);
        errors.push({ id, error: error.message });
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Bulk rotation completed with ${errors.length} errors`);
    }

    this.eventEmitter.emit('secrets.bulk_rotated', {
      successCount: results.length,
      errorCount: errors.length,
      errors,
      timestamp: new Date(),
    });

    return results;
  }

  async getAffectedServices(id: string) {
    const secret = await this.secretRepository.findOne({
      where: { id },
      relations: ['affectedServices'],
    });

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${id} not found`);
    }

    return {
      secretName: secret.name,
      services: secret.affectedServices || [],
    };
  }

  private async findSecretById(id: string): Promise<Secret> {
    const secret = await this.secretRepository.findOne({
      where: { id },
      relations: ['affectedServices'],
    });

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${id} not found`);
    }

    return secret;
  }

  private async encryptValue(value: string): Promise<string> {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, encryptionKey);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptValue(encryptedValue: string): Promise<string> {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    const algorithm = 'aes-256-gcm';

    const [ivHex, encrypted] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipher(algorithm, encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateSecretValue(type: string): string {
    switch (type) {
      case 'API_KEY':
        return `ak_${crypto.randomBytes(32).toString('hex')}`;
      case 'JWT_SECRET':
        return crypto.randomBytes(64).toString('base64');
      case 'DATABASE_PASSWORD':
        return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '');
      default:
        return crypto.randomBytes(32).toString('hex');
    }
  }

  private async notifyAffectedServices(
    secret: Secret,
    newValue: string,
  ): Promise<void> {
    if (!secret.affectedServices || secret.affectedServices.length === 0) {
      return;
    }

    const notificationPromises = secret.affectedServices.map(
      async (service) => {
        try {
          await this.notificationService.notifyServiceOfSecretRotation({
            serviceName: service.name,
            serviceEndpoint: service.endpoint,
            secretName: secret.name,
            secretType: secret.type,
            newValue: newValue, // In production, consider using secure channels
          });

          this.logger.log(
            `Notified service ${service.name} of secret rotation`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to notify service ${service.name}: ${error.message}`,
          );
        }
      },
    );

    await Promise.allSettled(notificationPromises);
  }

  private toResponseDto(secret: Secret): SecretResponseDto {
    return {
      id: secret.id,
      name: secret.name,
      type: secret.type,
      description: secret.description,
      isActive: secret.isActive,
      expiresAt: secret.expiresAt,
      lastRotatedAt: secret.lastRotatedAt,
      rotationCount: secret.rotationCount || 0,
      affectedServices:
        secret.affectedServices?.map((service) => ({
          id: service.id,
          name: service.name,
          endpoint: service.endpoint,
        })) || [],
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }
}
