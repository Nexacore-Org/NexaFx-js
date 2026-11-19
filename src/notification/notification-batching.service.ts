/**
 * Notification batching service — CT fix
 *
 * This file is self-contained so its behavior and dependency contracts are
 * explicit. When integrating into an existing NestJS application, replace
 * the dependency interfaces with the application's concrete service types
 * and map enqueueEmailDigest/sendPush to the corresponding MailService and
 * PushService methods.
 *
 * Important:
 * - A title is presentation text, never an event identity.
 * - Supply data.dedupeKey (ideally transactionId) for stable event identity.
 * - The newest notification is selected by createdAt, not array position.
 * - Preferences are resolved independently for each (user, channel, eventType).
 */

export type NotificationChannel = 'PUSH' | 'EMAIL';

export interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, unknown> & {
    /** Stable event identity, e.g. transactionId. */
    dedupeKey?: string;
    transactionId?: string;
    [key: string]: unknown;
  };
}

export interface PendingNotification {
  /** Unique notification/event id. Used as the fallback dedupe identity. */
  id: string;
  userId: string;
  channel: NotificationChannel;
  eventType: string;
  payload: PushPayload;
  /** Unix milliseconds, ISO string, or Date. */
  createdAt: Date | string | number;
}

export interface NotificationPreference {
  enabled: boolean;
  /** false bypasses batching for this exact channel/event type. */
  batchingEnabled: boolean;
}

export interface NotificationPreferenceService {
  getPreference(
    userId: string,
    channel: NotificationChannel,
    eventType: string,
  ): Promise<NotificationPreference | null>;
}

export interface PushDeliveryService {
  sendPush(userId: string, payload: PushPayload): Promise<void>;
}

export interface EmailDigestItem {
  eventType: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface EmailDigest {
  subject: string;
  title: string;
  summary: string;
  count: number;
  items: EmailDigestItem[];
}

/**
 * Adapter contract for MailService.
 * Implement this with the real MailService method that enqueues a job on
 * `email-queue`; do not merely log the digest.
 */
export interface MailDeliveryService {
  enqueueEmailDigest(userId: string, digest: EmailDigest): Promise<void>;
}

export interface NotificationBatchingOptions {
  windowMs: number;
}

type BatchKey = string;

export class NotificationBatchingService {
  private readonly batches = new Map<BatchKey, PendingNotification[]>();
  private readonly timers = new Map<BatchKey, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly preferences: NotificationPreferenceService,
    private readonly push: PushDeliveryService,
