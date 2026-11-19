import { DevicePlatform } from '../device-token.entity';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  token: string;
  platform: DevicePlatform;
  success: boolean;
  /** Credentials were not configured, so nothing was sent. */
  skipped?: boolean;
  /** A 5xx/429 or equivalent: callers may retry this device. */
  retryable?: boolean;
  error?: string;
}

/** Base class lets callers distinguish permanent and retryable failures. */
export class PushSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** FCM UNREGISTERED / APNs 410 or BadDeviceToken: delete the token. */
export class InvalidDeviceTokenError extends PushSendError {}

/** 5xx / 429: surface to the caller's queue instead of logging and swallowing. */
export class TransientPushError extends PushSendError {
  constructor(message: string, readonly results?: PushDeliveryResult[]) {
    super(message, undefined, undefined, true);
  }
}

export interface PushProvider {
  readonly name: string;
  supports(platform: DevicePlatform): boolean;
  isConfigured(): boolean;
  send(token: string, payload: PushPayload): Promise<void>;
}

interface ProviderErrorShape {
  status?: number;
  message?: string;
  reason?: string;
  response?: {
    status?: number;
    statusCode?: number;
    data?:
      | string
      | {
          error?: string | { status?: string; code?: string; message?: string };
          reason?: string;
          message?: string;
        };
  };
}

/** Normalize provider/HTTP errors into the two categories callers need. */
export function normalizePushError(error: unknown): PushSendError {
  const err = (error ?? {}) as ProviderErrorShape;
  const status = err.response?.status ?? err.response?.statusCode ?? err.status;
  const data = err.response?.data;
  const payload: {
    error?: string | { status?: string; code?: string; message?: string };
    reason?: string;
    message?: string;
  } = typeof data === 'string' ? { error: data } : data ?? {};
  const nested = typeof payload.error === 'object' ? payload.error : undefined;
  const code =
    nested?.status ??
    nested?.code ??
    (typeof payload.error === 'string' ? payload.error : undefined) ??
    payload.reason ??
    err.reason;
  const message =
    nested?.message ?? payload.message ?? err.message ?? 'Push delivery failed';

  const permanentCodes = new Set([
    'UNREGISTERED',
    'NotRegistered',
    'BadDeviceToken',
    'DeviceTokenNotForTopic',
    'InvalidToken',
    'Unregistered',
  ]);

  if (status === 410 || (code && permanentCodes.has(code))) {
    return new InvalidDeviceTokenError(message, status, code);
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return new TransientPushError(message);
  }
  return new PushSendError(message, status, code);
}
