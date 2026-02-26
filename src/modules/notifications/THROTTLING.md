# Notification Throttling System

This document describes the notification throttling implementation that reduces spam and manages rate bursts in the NexaFx system.

## Overview

The notification throttling system batches notifications by type and sends them in controlled bursts instead of immediately, preventing system overload during spikes.

### Key Features

- **Per-Type Throttling Rules**: Define separate throttle configurations for each notification type
- **Batching**: Group multiple notifications together before sending
- **Time-Window Based Flushing**: Automatically flush batches after a configurable window
- **Size-Triggered Flushing**: Immediately flush when batch reaches max size
- **Admin Configuration**: Runtime configuration without redeployment
- **Queue Monitoring**: Monitor pending notifications and queue health
- **Graceful Degradation**: Disable throttling per-type if needed

## Architecture

```
┌─────────────────────────────────────────┐
│  Application Layer                      │
│  (WebhooksService, RetryService, etc)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  NotificationService (Public API)       │
│  - send()                               │
│  - flush()                              │
│  - getQueueStatus()                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  NotificationThrottleService            │
│  - queue()                              │
│  - flush()                              │
│  - updateThrottleConfig()               │
│  (In-memory queue + DB tracking)        │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         ▼               ▼
    In-Memory      Database
    Queues        (Throttle
    (Fast)        Config)
```

## Database Schema

### notification_throttles table

```sql
CREATE TABLE notification_throttles (
  id UUID PRIMARY KEY,
  notificationType VARCHAR(100) UNIQUE NOT NULL,
  maxBatchSize INT DEFAULT 10,
  windowSeconds INT DEFAULT 300,
  cooldownSeconds INT DEFAULT 60,
  enabled BOOLEAN DEFAULT true,
  currentBatchCount INT DEFAULT 0,
  batchStartedAt TIMESTAMPTZ,
  lastSentAt TIMESTAMPTZ,
  pendingCount INT DEFAULT 0,
  metadata JSONB,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

## Default Throttle Rules

| Notification Type | Max Batch | Window | Cooldown | Purpose |
|---|---|---|---|---|
| `transaction.completed` | 20 | 5 min | 1 min | Group successful transactions |
| `transaction.failed` | 15 | 3 min | 45 sec | Group failed transactions |
| `webhook.failed` | 10 | 10 min | 2 min | Batch webhook failures |
| `retry.job.failed` | 25 | 5 min | 1 min | Group failed retry attempts |
| `device.login` | 5 | 2 min | 30 sec | High-priority login alerts |

## Usage

### Basic Usage

```typescript
import { NotificationService } from './modules/notifications/services/notification.service';

constructor(private notificationService: NotificationService) {}

async sendNotification() {
  // Send a notification (will be queued and throttled)
  await this.notificationService.send({
    type: 'transaction.completed',
    userId: 'user123',
    payload: {
      transactionId: 'tx456',
      amount: 1000,
      currency: 'USD'
    },
    timestamp: new Date()
  });
}
```

### With Webhook Integration

```typescript
import { NotificationService } from '../notifications/services/notification.service';

@Injectable()
export class WebhookDispatcherService {
  constructor(private notificationService: NotificationService) {}

  async dispatch(eventName: string, payload: Record<string, any>) {
    // ... existing code ...
    
    // Send throttled notification on failure
    await this.notificationService.send({
      type: 'webhook.failed',
      recipientId: subscriptionId,
      payload: {
        webhookUrl: url,
        error: message,
        deliveryId: delivery.id
      }
    });
  }
}
```

## Admin API Endpoints

### Get all throttle configurations

```bash
GET /admin/notifications/throttles
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "notificationType": "transaction.completed",
      "maxBatchSize": 20,
      "windowSeconds": 300,
      "cooldownSeconds": 60,
      "enabled": true,
      "currentBatchCount": 5,
      "lastSentAt": "2025-01-25T10:30:00Z",
      "pendingCount": 8
    }
  ],
  "count": 5
}
```

### Get specific throttle config

```bash
GET /admin/notifications/throttles/:type
```

### Update throttle configuration

```bash
PATCH /admin/notifications/throttles/:type
Content-Type: application/json

{
  "maxBatchSize": 30,
  "windowSeconds": 600,
  "cooldownSeconds": 120,
  "enabled": true
}
```

### Create new throttle rule

```bash
POST /admin/notifications/throttles
Content-Type: application/json

{
  "notificationType": "custom.event",
  "maxBatchSize": 15,
  "windowSeconds": 300,
  "cooldownSeconds": 60,
  "enabled": true,
  "metadata": { "priority": "high" }
}
```

### Get queue status

```bash
GET /admin/notifications/queue-status
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "notificationType": "transaction.completed",
      "enabled": true,
      "queueLength": 12,
      "maxBatchSize": 20,
      "windowSeconds": 300,
      "lastSentAt": "2025-01-25T10:25:00Z",
      "currentBatchCount": 5,
      "pendingCount": 12
    }
  ],
  "timestamp": "2025-01-25T10:30:00Z"
}
```

### Flush all notifications

```bash
POST /admin/notifications/flush-all
```

### Flush specific type

```bash
POST /admin/notifications/flush/:type
```

### Reset throttle state

```bash
POST /admin/notifications/reset/:type
```

## Scheduled Jobs

### NotificationBatchJob

- **processBatches()**: Runs every 5 minutes to flush pending batches
- **monitorQueueHealth()**: Runs every minute to check for queue backlog warnings

## How It Works

### Notification Flow

1. **Send**: Application calls `notificationService.send()`
2. **Queue**: Notification is added to in-memory queue for its type
3. **Check Throttle**:
   - If batch size reached → Flush immediately
   - Otherwise → Schedule timer (if not already scheduled)
4. **Flush**: Timer fires or batch size reached
   - Extract all notifications from queue
   - Generate batch ID
   - Update database tracking
   - Return batch for processing

### Throttle States

| State | Meaning | Action |
|---|---|---|
| `enabled: true` | Throttling active | Queue notifications |
| `enabled: false` | Throttling disabled | Send immediately |
| `currentBatchCount` | Notifications in last batch | Historical tracking |
| `pendingCount` | Notifications waiting to send | Real-time queue size |

## Configuration Examples

### High-Traffic Scenario

For notification types experiencing heavy load:

```bash
PATCH /admin/notifications/throttles/transaction.completed
{
  "maxBatchSize": 50,        # Larger batches
  "windowSeconds": 600,      # Longer window
  "cooldownSeconds": 180     # Longer cooldown
}
```

### Real-Time Critical Notifications

For urgent notifications that can't wait:

```bash
PATCH /admin/notifications/throttles/device.login
{
  "maxBatchSize": 2,         # Small batch
  "windowSeconds": 30,       # Short window
  "cooldownSeconds": 10,     # Quick cooldown
  "enabled": true
}
```

### Disable Throttling

To send notifications immediately:

```bash
PATCH /admin/notifications/throttles/custom.event
{
  "enabled": false
}
```

## Monitoring & Observability

### Logs

The system logs:
- Notification queuing: `Queued notification: {type} (queue size: {size})`
- Batch flushing: `Flushing {count} notifications for {type} (batch: {batchId})`
- Queue warnings: `Queue warning for {type}: {queueLength} pending`

### Metrics to Track

- Queue length per type
- Batch size distribution
- Window latency (time from first → last notification in batch)
- Flush frequency per type
- Failed vs successful batches

### Health Checks

```bash
GET /admin/notifications/queue-status
```

Check for:
- `queueLength > maxBatchSize * 2` → Queue backlog warning
- `enabled: false` → Throttling disabled
- `lastSentAt` → Last successful flush time

## Best Practices

1. **Set Appropriate Batch Sizes**
   - Too small: More overhead, less batching benefit
   - Too large: Higher latency, more memory usage

2. **Tune Window Duration**
   - Too short: Frequent flushes, less batching
   - Too long: Notifications delayed, larger batches

3. **Monitor Queue Status**
   - Regularly check `/queue-status` endpoint
   - Alert on queue length > 2x maxBatchSize

4. **Disable Selectively**
   - Only disable throttling for critical real-time notifications
   - Use high batch size + short window for semi-critical

5. **Database Maintenance**
   - Keep throttle config table small (< 100 entries typically)
   - Archive or clean old batch history if tracking per-batch

## Implementation Details

### In-Memory Queues

- **Data Structure**: `Map<notificationType, ThrottledNotification[]>`
- **Scope**: Service instance lifecycle
- **Reset**: On application shutdown, all timers cleared

### Database Tracking

- **Purpose**: Persist throttle rules across restarts
- **Size**: One row per notification type (typically < 100 rows)
- **Performance**: Indexed on `notificationType` and `enabled`

### Timer Management

- **Per-Type Timers**: One active timer per notification type
- **Auto-Cleanup**: Cleared when batch flushed or app shuts down
- **Prevention**: Check `timers.has(type)` before creating new timer

## Troubleshooting

### Notifications not being sent

1. Check if throttling is enabled: `GET /admin/notifications/throttles/:type`
2. Check queue status: `GET /admin/notifications/queue-status`
3. Manually flush: `POST /admin/notifications/flush/:type`

### Queue growing indefinitely

1. Check `monitorQueueHealth()` logs for warnings
2. Increase `maxBatchSize` or decrease `windowSeconds`
3. Ensure application has enough memory for in-memory queues

### High latency before notifications sent

1. Decrease `windowSeconds` for that notification type
2. Decrease `maxBatchSize` to flush more frequently
3. Consider disabling throttling if real-time is critical

## Future Enhancements

- [ ] Persistent queue (Redis/RabbitMQ) for cross-server resilience
- [ ] Circuit breaker pattern for failed batch delivery
- [ ] Priority levels (critical, normal, low)
- [ ] Recipient-level throttling (different rules per user)
- [ ] Batch delivery status tracking
- [ ] Metrics export (Prometheus)
