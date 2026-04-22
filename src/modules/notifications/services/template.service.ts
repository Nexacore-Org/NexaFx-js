import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Handlebars from 'handlebars';
import {
  NotificationTemplateEntity,
  TemplateChannel,
} from '../entities/notification-template.entity';

export interface RenderedTemplate {
  subject: string | null;
  body: string;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly repo: Repository<NotificationTemplateEntity>,
  ) {}

  async create(dto: {
    name: string;
    channel: TemplateChannel;
    locale: string;
    subjectTemplate?: string;
    bodyTemplate: string;
    requiredVariables?: string[];
  }): Promise<NotificationTemplateEntity> {
    const entity = this.repo.create({
      ...dto,
      locale: dto.locale ?? 'en',
      requiredVariables: dto.requiredVariables ?? [],
      version: 1,
      isArchived: false,
    });
    return this.repo.save(entity);
  }

  async findAll(): Promise<NotificationTemplateEntity[]> {
    return this.repo.find({ order: { name: 'ASC', locale: 'ASC' } });
  }

  async findOne(id: string): Promise<NotificationTemplateEntity> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  /**
   * PATCH creates a new version — old version is archived, new one is active.
   */
  async update(
    id: string,
    dto: Partial<{
      subjectTemplate: string;
      bodyTemplate: string;
      requiredVariables: string[];
    }>,
  ): Promise<NotificationTemplateEntity> {
    const existing = await this.findOne(id);

    // Archive the current version by cloning it
    const archived = this.repo.create({
      ...existing,
      id: undefined as any,
      isArchived: true,
    });
    await this.repo.save(archived);

    // Update the active record with incremented version
    Object.assign(existing, dto, { version: existing.version + 1 });
    return this.repo.save(existing);
  }

  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.repo.remove(t);
  }

  /**
   * Restore a specific archived version by cloning it as the new active version.
   */
  async restoreVersion(
    id: string,
    version: number,
  ): Promise<NotificationTemplateEntity> {
    const archived = await this.repo.findOne({
      where: { id, version, isArchived: true },
    });
    if (!archived) {
      throw new NotFoundException(`Archived version ${version} not found for template ${id}`);
    }

    // Find the current active template with the same name/channel/locale
    const active = await this.repo.findOne({
      where: {
        name: archived.name,
        channel: archived.channel,
        locale: archived.locale,
        isArchived: false,
      },
    });

    if (active) {
      // Archive the current active
      active.isArchived = true;
      await this.repo.save(active);
    }

    // Restore archived as new active
    const restored = this.repo.create({
      ...archived,
      id: undefined as any,
      isArchived: false,
      version: (active?.version ?? archived.version) + 1,
    });
    return this.repo.save(restored);
  }

  /**
   * Render a template with sample or real data.
   * Validates that all requiredVariables are present.
   */
  render(
    template: NotificationTemplateEntity,
    variables: Record<string, unknown>,
  ): RenderedTemplate {
    const missing = template.requiredVariables.filter((v) => !(v in variables));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required template variables: ${missing.join(', ')}`,
      );
    }

    const body = Handlebars.compile(template.bodyTemplate)(variables);
    const subject = template.subjectTemplate
      ? Handlebars.compile(template.subjectTemplate)(variables)
      : null;

    return { subject, body };
  }

  /**
   * Resolve a template by name + channel, with locale fallback to 'en'.
   */
  async resolve(
    name: string,
    channel: TemplateChannel,
    locale: string,
  ): Promise<NotificationTemplateEntity | null> {
    // Try exact locale first
    const exact = await this.repo.findOne({
      where: { name, channel, locale, isArchived: false },
    });
    if (exact) return exact;

    // Fallback to 'en'
    if (locale !== 'en') {
      return this.repo.findOne({
        where: { name, channel, locale: 'en', isArchived: false },
      });
    }
    return null;
  }
}
