# Reconciliation Service Implementation Guide

## Overview

The ReconciliationService has been fully implemented to detect and resolve transaction mismatches between payment providers and blockchain networks. The system runs every 10 minutes and automatically resolves discrepancies when consensus is reached.

## Architecture

### Components

1. **ReconciliationService** (`src/modules/reconciliation/services/reconciliation.service.ts`)
   - Main orchestrator for reconciliation logic
   - Detects PROVIDER_MISMATCH, BLOCKCHAIN_MISMATCH, and BOTH_MISMATCH scenarios
   - Auto-resolves when both sources agree
   - Escalates ambiguous cases for manual review

2. **BlockchainService** (`src/modules/blockchain/blockchain.service.ts`)
   - Interface-based implementation for testability
   - Provides RPC calls to blockchain nodes
   - Tracks transaction confirmations and finalization status
   - Configurable via environment variables

3. **ConfirmationTracker** (`src/modules/blockchain/confirmation.tracker.ts`)
   - Monitors blockchain transactions for finalization
   - Detects and handles chain reorganizations (reorgs)
   - Automatically updates transaction status on finalization

4. **BlockchainModule** (`src/modules/blockchain/blockchain.module.ts`)
   - Encapsulates blockchain services and makes them injectable

## Key Features

### 1. Mismatch Detection
- **PROVIDER_MISMATCH**: Provider reports success/failure but blockchain hasn't confirmed yet
- **BLOCKCHAIN_MISMATCH**: Blockchain confirms while provider API is unavailable/silent
- **BOTH_MISMATCH**: Provider and blockchain disagree (conflicting data)

### 2. Auto-Resolution
When both provider and blockchain agree on a terminal state (SUCCESS or FAILED), the transaction is automatically resolved without manual intervention.

### 3. Escalation
When no consensus exists or sources conflict, issues are marked as ESCALATED for manual review to prevent false resolutions.

### 4. Robust Error Handling
- API timeouts/failures don't cause false positives
- Blockchain RPC errors are gracefully handled
- Missing transaction metadata doesn't crash the system

## Database Schema

### ReconciliationIssueEntity
```sql
CREATE TABLE reconciliation_issues (
  id UUID PRIMARY KEY,
  transactionId UUID NOT NULL REFERENCES transactions(id),
  mismatchType VARCHAR(50) NOT NULL,
  internalStatus VARCHAR(50) NOT NULL,
  providerStatus VARCHAR(50),
  blockchainStatus VARCHAR(50),
  status VARCHAR(50) DEFAULT 'OPEN',
  resolution TEXT,
  rawSnapshot JSONB,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP,
  INDEX idx_recon_status(status),
  INDEX idx_recon_transaction(transactionId)
);
```

### TransactionEntity (Enhanced)
```sql
-- Requires these fields:
- externalId: VARCHAR(100) - Payment provider transaction ID
- metadata: JSONB - Should contain { txHash: '0x...' }
```

## Environment Variables

### Required
```env
# Blockchain Configuration
BLOCKCHAIN_RPC_URL=http://localhost:8545
BLOCKCHAIN_REQUIRED_CONFIRMATIONS=12

# Payment Provider Configuration
PROVIDER_API_URL=https://api.payment-provider.com
PROVIDER_API_KEY=your_api_key_here
PROVIDER_API_TIMEOUT=30000
```

### Optional
- `PROVIDER_API_TIMEOUT`: Default 30000ms
- `BLOCKCHAIN_REQUIRED_CONFIRMATIONS`: Default 12 blocks

## API Endpoints

### Get Reconciliation Issues
```http
GET /admin/reconciliation?page=1&limit=20&status=ESCALATED
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `status`: Filter by status (OPEN, AUTO_RESOLVED, ESCALATED)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transactionId": "uuid",
      "mismatchType": "BOTH_MISMATCH",
      "internalStatus": "PENDING",
      "providerStatus": "SUCCESS",
      "blockchainStatus": "FAILED",
      "status": "ESCALATED",
      "resolution": "No consensus — manual review required",
      "createdAt": "2023-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

## Cron Job Configuration

The reconciliation job runs every **10 minutes** and:
1. Finds all PENDING transactions older than 5 minutes
2. Fetches status from both provider and blockchain
3. Detects mismatches and initiates resolution
4. Logs statistics: flagged, auto-resolved, escalated count

**Cron Expression:** `EVERY_10_MINUTES` (0 */10 * * * *)

## Implementation Details

### Provider Status Mapping

The system normalizes provider statuses to standard transaction states:

| Provider Status | Internal Status |
|-----------------|-----------------|
| PENDING         | PENDING         |
| PROCESSING      | PENDING         |
| COMPLETED       | SUCCESS         |
| SUCCEEDED       | SUCCESS         |
| FAILED          | FAILED          |
| FAILURE         | FAILED          |
| CANCELLED       | CANCELLED       |

### Blockchain Status Logic

1. Queries `eth_getTransactionReceipt` to check if mined
2. Verifies confirmation count against required threshold
3. Returns status based on receipt.status field
   - `0x1` (1) = SUCCESS
   - `0x0` (0) = FAILED
   - null = pending or not found

### Auto-Resolution Logic

```typescript
private deriveResolution(
  providerStatus: string | null,
  blockchainStatus: string | null
): 'SUCCESS' | 'FAILED' | null {
  const terminalStates = ['SUCCESS', 'FAILED'];
  const candidates = [providerStatus, blockchainStatus].filter(Boolean);
  
  if (candidates.length === 0) return null;
  
  // All sources agree and it's a terminal state
  const allAgree = candidates.every((s) => s === candidates[0]);
  if (allAgree && terminalStates.includes(candidates[0]!)) {
    return candidates[0] as 'SUCCESS' | 'FAILED';
  }
  
  return null; // Escalate for manual review
}
```

## Test Coverage

### Unit Tests
- **ReconciliationService** (63 test cases)
  - Mismatch detection (PROVIDER, BLOCKCHAIN, BOTH)
  - Auto-resolution scenarios
  - Escalation logic
  - Provider status normalization
  - Error handling
  - Pagination and filtering

- **BlockchainService** (24 test cases)
  - Transaction receipt retrieval
  - Block number queries
  - Transaction status determination
  - Confirmation count verification
  - RPC error handling

- **ConfirmationTracker** (15 test cases)
  - Transaction tracking lifecycle
  - Finalization on confirmed blocks
  - Orphaned transaction detection
  - Chain reorg handling
  - Module shutdown cleanup

### Integration Tests
- End-to-end reconciliation flows
- Multi-transaction scenarios
- Pagination and filtering
- Status persistence across runs

## Usage Examples

### Start Monitoring a Transaction

```typescript
// When a transaction is submitted to blockchain:
const txHash = '0x...';
const tracker = app.get(ConfirmationTracker);
await tracker.trackTransaction(txHash);
```

### Manual Reconciliation Trigger

```typescript
const reconciliation = app.get(ReconciliationService);
await reconciliation.runReconciliation();
```

### Query Escalated Issues

```typescript
const issues = await reconciliation.getIssues({
  status: 'ESCALATED',
  limit: 50,
});
```

## Performance Considerations

### Scalability
- Cron job scans only PENDING transactions older than 5 minutes
- Database indices on status, transactionId, and createdAt
- Batch processing doesn't block the event loop

### Optimization Tips
1. **Blockchain**: Use a dedicated RPC node, not public endpoints
2. **Provider API**: Implement caching for recent transactions
3. **Database**: Regular cleanup of resolved issues (older than 30 days)
4. **Logging**: Use appropriate log levels in production

## Troubleshooting

### No Mismatches Detected
1. Verify environment variables are set correctly
2. Check blockchain RPC endpoint accessibility
3. Ensure provider API key is valid
4. Confirm transaction metadata includes txHash

### Auto-Resolution Not Working
1. Check that both provider and blockchain agree on status
2. Verify transaction statuses are being normalized correctly
3. Ensure no conflicting data in raw sources

### Chain Reorg Handling
- Transactions marked as FAILED if block becomes invalid
- Confirmation tracker automatically detects and handles reorgs
- Check blockchain logs for reorg activity

## Security Notes

1. **API Keys**: Store PROVIDER_API_KEY in secrets manager, never commit to repo
2. **RPC Endpoints**: Use trusted nodes only, validate all responses
3. **Database**: Ensure reconciliation tables have proper access controls
4. **Logging**: Don't log sensitive transaction data or API responses

## Future Enhancements

1. **Parallel Provider Support**: Handle multiple payment providers simultaneously
2. **Multi-Chain Support**: Extend blockchain service for Polygon, Arbitrum, etc.
3. **Webhook Integration**: Notify stakeholders of escalated issues
4. **Machine Learning**: Predict likely resolution based on historical patterns
5. **Custom Reconciliation Rules**: Allow domain-specific logic per transaction type

## Support

For issues or questions:
1. Check the test files for usage examples
2. Review error logs in application logger
3. Validate environment configuration
4. Contact the development team for custom scenarios
