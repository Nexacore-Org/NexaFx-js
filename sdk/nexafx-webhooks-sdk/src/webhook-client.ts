import axios, { AxiosInstance } from 'axios';
import { NexaFxEventPayloadMap, NexaFxEventType, parseWebhookEvent } from './event-types';
import { verifySignature as verifySignatureValue } from './webhook-verifier';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'disabled';
  createdAt: string;
  signingSecret?: string;
}

export interface SubscribeInput {
  url: string;
  events: NexaFxEventType[];
}

export interface VerifySignatureOptions {
  secret: string;
  payload: string | Buffer;
  signatureHeader: string;
  timestampHeader: string;
}

export class WebhookClient {
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    axiosInstance?: AxiosInstance,
  ) {
    this.httpClient =
      axiosInstance ??
      axios.create({
        baseURL: baseUrl.replace(/\/+$/, ''),
        headers: {
          'Content-Type': 'application/json',
        },
      });
  }

  async subscribe(input: SubscribeInput): Promise<WebhookSubscription> {
    const response = await this.httpClient.post<WebhookSubscription>('/webhooks', input);
    return response.data;
  }

  async unsubscribe(subscriptionId: string): Promise<WebhookSubscription | null> {
    const response = await this.httpClient.patch<WebhookSubscription>(
      `/webhooks/${subscriptionId}`,
      { status: 'disabled' },
    );
    return response.data;
  }

  verifySignature(options: VerifySignatureOptions): boolean {
    return verifySignatureValue({
      secret: options.secret,
      payload: options.payload,
      signature: options.signatureHeader,
      timestamp: options.timestampHeader,
    });
  }

  parseEvent<TEventType extends NexaFxEventType>(
    eventType: TEventType,
    payload: unknown,
  ) {
    return parseWebhookEvent<TEventType>(eventType, payload as NexaFxEventPayloadMap[TEventType]);
  }
}
