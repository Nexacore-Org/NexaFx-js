import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { FindManyOptions } from 'typeorm';
import { WebhooksService } from './webhooks.service';
import { WebhooksListener } from './webhooks.listener';
import { WebhookEndpoint } from './webhook-endpoint.entity';
import { WebhookDelivery } from './webhook-delivery.entity';

/**
 * #1444: webhook dispatch leaked every tenant's events to any subscriber.
 * These tests prove that:
 *  - an endpoint owned by user A receives no delivery for a transfer between
 *    B and C,
 *  - a transfer party receives only their own (counterparty-masked) payload,
 *  - AML/compliance events are never delivered to user endpoints, and
 *  - internal-only events cannot be subscribed to.
 */
describe('Webhook dispatch scoping (#1444)', () => {
  let service: WebhooksService;
  let listener: WebhooksListener;
  let emitter: EventEmitter2;
  let endpointsRepository: {
    find: jest.Mock<
      Promise<WebhookEndpoint[]>,
      [FindManyOptions<WebhookEndpoint>]
    >;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let deliveriesRepository: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock<WebhookDelivery, [Partial<WebhookDelivery>]>;
    save: jest.Mock<
      Promise<Partial<WebhookDelivery>>,
      [Partial<WebhookDelivery>]
    >;
  };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    endpointsRepository = {
      find: jest
        .fn<Promise<WebhookEndpoint[]>, [FindManyOptions<WebhookEndpoint>]>()
        .mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      save: jest.fn(),
    };
    deliveriesRepository = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn<WebhookDelivery, [Partial<WebhookDelivery>]>(
        (dto) => dto as WebhookDelivery,
      ),
      save: jest
        .fn<Promise<Partial<WebhookDelivery>>, [Partial<WebhookDelivery>]>()
        .mockImplementation((dto) => Promise.resolve(dto)),
    };
    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        WebhooksService,
        WebhooksListener,
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: endpointsRepository,
        },
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: deliveriesRepository,
        },
        { provide: getQueueToken('webhooks'), useValue: queue },
      ],
    }).compile();

    await module.init();
    service = module.get(WebhooksService);
    listener = module.get(WebhooksListener);
    emitter = module.get(EventEmitter2);
  });

  it('scopes the endpoint query to the parties of the event', async () => {
    await service.dispatchEvent(
      'transactions.completed',
      ['user-b', 'user-c'],
      {
        transactionId: 'tx-1',
        senderId: 'user-b',
        receiverId: 'user-c',
        amount: '10',
        currency: 'USD',
      },
    );

    const where = endpointsRepository.find.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.ownerId).toMatchObject({
      _type: 'in',
      _value: ['user-b', 'user-c'],
    });
  });

  it('never notifies an endpoint owned by an unrelated user (B→C transfer)', async () => {
    const allEndpoints = [
      {
        id: 'ep-a',
        ownerId: 'user-a',
        events: ['transactions.completed'],
        isActive: true,
        secret: 's',
      } as WebhookEndpoint,
    ];
    // Simulate the database applying the `ownerId IN (...)` filter.
    endpointsRepository.find.mockImplementation(({ where }) => {
      const ids = (where.ownerId as { _value?: string[] })?._value ?? [];
      return Promise.resolve(
        allEndpoints.filter((endpoint) => ids.includes(endpoint.ownerId)),
      );
    });

    await emitter.emitAsync('transactions.completed', {
      transactionId: 'tx-1',
      senderId: 'user-b',
      receiverId: 'user-c',
      amount: '10',
      currency: 'USD',
    });

    expect(deliveriesRepository.save).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('gives each transfer party only their own side, masking the counterparty', async () => {
    endpointsRepository.find.mockResolvedValue([
      {
        id: 'ep-b',
        ownerId: 'user-b',
        events: ['transactions.completed'],
        isActive: true,
        secret: 's',
      } as WebhookEndpoint,
    ]);

    await service.dispatchEvent(
      'transactions.completed',
      ['user-b', 'user-c'],
      {
        transactionId: 'tx-1',
        senderId: 'user-b',
        receiverId: 'user-c',
        amount: '10',
        currency: 'USD',
        reference: 'ref-1',
      },
    );

    const body = deliveriesRepository.save.mock.calls[0][0].requestBody;
    expect(body).toMatchObject({ direction: 'outgoing', amount: '10' });
    // The sender should not be handed the full receiver id as a raw party id.
    expect(body).not.toHaveProperty('senderId');
    expect(body).not.toHaveProperty('receiverId');
  });

  it('does not dispatch compliance-only AML events to user endpoints', async () => {
    await service.dispatchEvent('aml.alert.created', ['user-b'], {
      userId: 'user-b',
      ruleTriggered: 'structuring',
      riskScore: 90,
    });

    expect(endpointsRepository.find).not.toHaveBeenCalled();
    expect(deliveriesRepository.save).not.toHaveBeenCalled();
  });

  it('does not forward aml.alert.created from the listener', async () => {
    const spy = jest.spyOn(service, 'dispatchEvent');

    await emitter.emitAsync('aml.alert.created', {
      userId: 'user-b',
      ruleTriggered: 'structuring',
      riskScore: 90,
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects subscribing to an internal-only event', async () => {
    await expect(
      service.createEndpoint({
        ownerId: 'user-a',
        url: 'https://example.com/hook',
        secret: 's',
        events: ['aml.alert.created'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(endpointsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects subscribing to an unknown/future-internal event', async () => {
    await expect(
      service.createEndpoint({
        ownerId: 'user-a',
        url: 'https://example.com/hook',
        secret: 's',
        events: ['kyc.reviewed'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does nothing when no owner can be derived', async () => {
    await service.dispatchEvent('transactions.completed', [], {
      transactionId: 'tx-1',
    });

    expect(endpointsRepository.find).not.toHaveBeenCalled();
  });

  it('routes an AML event to no customer endpoint via the listener', () => {
    // Sanity: the listener registers no handler for aml.alert.created.
    const handlers = (
      emitter as unknown as { listeners: (e: string) => unknown[] }
    ).listeners('aml.alert.created');
    expect(handlers).toHaveLength(0);
    void listener;
  });
});
