# Multi-Signature Approval System Enhancements

## Overview
The multi-signature approval system has been enhanced with rejection flow, transaction expiry, and admin override capabilities to provide comprehensive transaction governance.

## New Features

### 1. Single Approver Rejection Flow
- **Endpoint**: `POST /transactions/:id/reject`
- **Functionality**: Any single approver can immediately reject a transaction
- **Behavior**: 
  - Immediate rejection without waiting for quorum
  - Sets transaction status to `REJECTED`
  - Records rejection reason in audit trail
  - Sends notifications to transaction owner

### 2. Transaction Expiry System
- **Cron Job**: Runs every hour (`@Cron(CronExpression.EVERY_HOUR)`)
- **Default Window**: 72 hours for stale approvals
- **Behavior**:
  - Automatically expires transactions in `PENDING_APPROVAL` status
  - Sets status to `CANCELLED` with expiry reason
  - Sends expiry notifications to transaction owners
  - Prevents accumulation of stale approvals

### 3. Admin Force-Approve Override
- **Endpoint**: `POST /transactions/admin/:id/force-approve`
- **Authorization**: Admin role only
- **Functionality**: Bypasses approval quorum requirements
- **Audit Trail**: 
  - Records admin action with mandatory reason
  - Special comment format: `[ADMIN FORCE-APPROVE] {reason}`
  - Full audit logging for compliance

## API Endpoints

### Reject Transaction
```http
POST /transactions/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "comment": "High risk transaction detected"
}
```

**Response**:
```json
{
  "message": "Transaction rejected",
  "approvalId": "approval-uuid",
  "transactionId": "transaction-uuid",
  "transactionStatus": "REJECTED",
  "rejectionReason": "High risk transaction detected",
  "decision": "REJECTED",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Admin Force-Approve
```http
POST /transactions/admin/:id/force-approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "Urgent business requirement"
}
```

**Response**:
```json
{
  "message": "Transaction force-approved by admin",
  "transactionId": "transaction-uuid",
  "transactionStatus": "APPROVED"
}
```

## Transaction Status Flow

```
PENDING_APPROVAL
    |
    |--- APPROVED (quorum reached or admin force-approve)
    |
    |--- REJECTED (single approver rejection)
    |
    |--- CANCELLED (expiry after 72h)
```

## Security Features

### Role-Based Access Control
- **Approval Roles**: `admin`, `compliance_officer`, `finance_manager`
- **Admin Override**: `admin` role only for force-approve
- **Self-Approval Prevention**: Transaction owners cannot approve their own transactions

### Audit Trail
- All approval actions are logged with:
  - Approver ID and email
  - Decision (APPROVED/REJECTED)
  - Timestamp
  - Comments/reasons
  - Admin override indicators

### Validation Rules
- Minimum reason length (5 characters) for admin force-approve
- Optional comments for regular approvals/rejections
- Transaction must be in `PENDING_APPROVAL` status to act

## Configuration

### Approval Thresholds
```typescript
// approval-thresholds.config.ts
export const HIGH_VALUE_THRESHOLD_USD = 10000;
export const HIGH_VALUE_REQUIRED_APPROVALS = 3;
```

### Expiry Configuration
```typescript
// Default: 72 hours
@Cron(CronExpression.EVERY_HOUR)
async expireStaleApprovals(windowHours = 72): Promise<void>
```

## Notifications

The system sends notifications for:
- **Approval**: `approval.approved`
- **Rejection**: `approval.rejected`
- **Expiry**: `approval.expired`
- **Force-Approve**: `approval.force_approved`

## Error Handling

### Common Error Scenarios
1. **Transaction not found**: 404 error
2. **Invalid status**: 400 error when transaction not in `PENDING_APPROVAL`
3. **Self-approval**: 403 error for transaction owners
4. **Duplicate action**: 400 error when approver already acted
5. **Insufficient role**: 403 error for unauthorized roles

## Testing

### Test Coverage
- Unit tests for all service methods
- Controller tests for API endpoints
- Integration tests for complete workflows
- Error scenario testing

### Key Test Cases
- Single approver rejection
- Admin force-approve with audit trail
- Transaction expiry automation
- Role-based access control
- Self-approval prevention
- Duplicate action prevention

## Database Schema

### Transaction Entity Updates
```typescript
export class Transaction {
  // ... existing fields
  
  @Column({ type: 'int', default: 0 })
  requiredApprovals: number;
  
  @Column({ type: 'int', default: 0 })
  currentApprovals: number;
  
  @Column({ type: 'boolean', default: false })
  requiresApproval: boolean;
  
  @Column({ type: 'text', nullable: true })
  rejectionReason: string;
}
```

### Transaction Approval Entity
```typescript
export class TransactionApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ type: 'uuid' })
  transactionId: string;
  
  @Column({ type: 'uuid' })
  approverId: string;
  
  @Column({ type: 'enum', enum: ApprovalDecision })
  decision: ApprovalDecision;
  
  @Column({ type: 'text', nullable: true })
  comment: string;
  
  @CreateDateColumn()
  timestamp: Date;
}
```

## Best Practices

### For Approvers
1. Review transactions promptly to avoid expiry
2. Provide clear rejection reasons for audit purposes
3. Never approve your own transactions
4. Report suspicious activity immediately

### For Admins
1. Use force-approve sparingly and with clear justification
2. Document business reasons for overrides
3. Monitor admin override usage for compliance

### For Developers
1. Handle all error scenarios gracefully
2. Implement proper logging and monitoring
3. Test role-based access controls thoroughly
4. Maintain audit trail integrity

## Monitoring and Maintenance

### Metrics to Track
- Average approval time
- Rejection rate by approver
- Admin override frequency
- Expiry rate
- Pending approval backlog

### Maintenance Tasks
- Review and adjust approval thresholds
- Monitor cron job execution
- Audit admin override usage
- Update notification templates as needed

## Future Enhancements

### Potential Improvements
1. **Conditional Approvals**: Based on transaction type/risk score
2. **Escalation Workflows**: Auto-escalate stale approvals
3. **Batch Approvals**: Approve multiple transactions simultaneously
4. **Approval Delegation**: Temporary approval delegation
5. **Multi-Currency Thresholds**: Dynamic thresholds by currency

### Integration Opportunities
1. **Risk Engine Integration**: Dynamic approval requirements
2. **Compliance Systems**: Automated compliance checks
3. **Audit Systems**: Real-time audit reporting
4. **Monitoring Systems**: Alert on unusual approval patterns
