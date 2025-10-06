# Dispute and Resolution System

A comprehensive dispute and resolution system for handling transaction-related issues on the NexaFx platform. This system allows users to report issues, track dispute status, and enables support teams to investigate and resolve problems efficiently.

## Features

### Core Functionality
- **Dispute Creation**: Users can create disputes for valid transactions
- **Evidence Upload**: Support for multiple file formats (images, PDFs, documents)
- **State Management**: Comprehensive state machine for dispute lifecycle
- **SLA Tracking**: Automatic SLA monitoring and escalation
- **Auto-Assignment**: Intelligent agent assignment based on workload and skills
- **Fraud Detection**: AI-powered fraud analysis and scoring
- **OCR Processing**: Automatic text extraction from receipts and documents
- **Notification System**: Multi-channel notifications (email, SMS, push)

### Dispute Categories
- `unauthorized_transaction` - Transaction not authorized by user
- `transaction_failed` - Transaction marked complete but failed
- `wrong_amount` - Incorrect amount debited/credited
- `duplicate_charge` - Same transaction charged multiple times
- `service_not_received` - Payment made but service not delivered
- `technical_error` - System error during transaction
- `fraud_suspected` - Suspected fraudulent activity
- `other` - Other issues requiring investigation

### Dispute States
- `draft` - Dispute being prepared
- `open` - Dispute submitted and awaiting assignment
- `investigating` - Assigned to agent for investigation
- `escalated` - Escalated to higher support tier
- `resolved` - Dispute resolved with outcome
- `closed` - Dispute closed after resolution
- `cancelled` - Dispute cancelled by user
- `auto-resolving` - Automated resolution in progress

### Priority Levels
- `critical` - Amount > ₦100,000 or Tier 3 users
- `high` - Amount > ₦50,000 or repeated disputes
- `medium` - Standard disputes
- `low` - Disputes with missing information

## API Endpoints

### User Endpoints
- `POST /disputes/create` - Create new dispute
- `GET /disputes/:disputeId` - Get dispute details
- `GET /disputes/user/:userId` - Get user's dispute history
- `PATCH /disputes/:disputeId/update` - Update dispute information
- `POST /disputes/:disputeId/evidence` - Submit evidence
- `GET /disputes/:disputeId/evidence` - Get dispute evidence
- `POST /disputes/:disputeId/comment` - Add comment
- `GET /disputes/:disputeId/timeline` - Get activity timeline
- `POST /disputes/:disputeId/cancel` - Cancel dispute
- `GET /disputes/categories` - Get available categories

### Admin/Agent Endpoints
- `POST /disputes/admin/:disputeId/assign` - Assign dispute to agent
- `POST /disputes/admin/:disputeId/resolve` - Resolve dispute
- `POST /disputes/admin/:disputeId/escalate` - Escalate dispute
- `GET /disputes/admin/pending` - Get pending disputes
- `GET /disputes/admin/assigned/:agentId` - Get agent's disputes
- `POST /disputes/:disputeId/refund` - Process refund
- `GET /disputes/admin/statistics` - Get dispute metrics
- `POST /disputes/:disputeId/auto-resolve` - Trigger auto-resolution
- `GET /disputes/admin/sla-violations` - Get SLA violations

## Database Schema

### Core Entities
- **User**: User information and agent status
- **Transaction**: Transaction details for dispute reference
- **Dispute**: Main dispute record with state and metadata
- **Evidence**: File uploads and OCR results
- **Comment**: Communication between users and agents
- **TimelineEntry**: Audit trail of all dispute activities
- **AuditLog**: Security and compliance logging

### Key Relationships
- Dispute belongs to User and Transaction
- Evidence belongs to Dispute
- Comments belong to Dispute
- Timeline entries belong to Dispute
- Audit logs belong to Dispute

## Background Jobs

### Queue Processors
1. **Dispute Processor**: Handles dispute assignment and auto-resolution
2. **Notification Processor**: Manages email, SMS, and push notifications
3. **OCR Processor**: Processes uploaded files for text extraction

### Scheduled Jobs
- **SLA Monitor**: Checks for SLA violations every 5 minutes
- **Stale Dispute Check**: Identifies inactive disputes daily
- **Daily SLA Report**: Generates compliance metrics

## Configuration

### SLA Targets
- Initial response: 2 hours
- Simple resolution: 24 hours
- Complex resolution: 72 hours
- Escalated cases: 5 business days

### File Upload Limits
- Maximum file size: 10MB
- Maximum files per dispute: 10
- Supported formats: JPEG, PNG, GIF, WebP, PDF, TXT

### Fraud Detection
- Risk scoring: 0-100 scale
- Auto-flagging for scores > 80
- Manual review for scores 50-80
- Standard processing for scores < 50

## Security Features

### Access Control
- Role-based access (User, Agent, Admin)
- Dispute ownership validation
- Agent assignment verification

### Data Protection
- Encrypted file storage in S3
- Presigned URLs for secure access
- Audit logging for all actions
- Data retention policies (7+ years)

### Fraud Prevention
- Duplicate dispute detection
- User behavior analysis
- Transaction pattern monitoring
- Automated risk scoring

## Integration Points

### External Services
- **AWS S3**: File storage and retrieval
- **OCR Services**: Text extraction from documents
- **Email Service**: Notification delivery
- **SMS Service**: Critical alerts
- **Payment System**: Refund processing

### Internal Services
- **User Management**: Authentication and authorization
- **Transaction System**: Payment verification
- **Notification Service**: Multi-channel messaging
- **Audit Service**: Compliance logging

## Monitoring and Metrics

### Key Performance Indicators
- Dispute resolution time
- SLA compliance rate
- Agent productivity metrics
- Fraud detection accuracy
- User satisfaction scores

### Alerts and Notifications
- SLA violation alerts
- Fraud detection alerts
- System health monitoring
- Performance degradation alerts

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- AWS S3 bucket
- Bull Queue setup

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/nexafx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=nexafx-disputes

# Email
EMAIL_SERVICE_API_KEY=your_key
EMAIL_FROM=noreply@nexafx.com

# Application
FRONTEND_URL=https://app.nexafx.com
```

### Installation
```bash
# Install dependencies
npm install

# Run database migrations
npm run migration:run

# Start the application
npm run start:dev
```

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:e2e
```

### Load Testing
```bash
npm run test:load
```

## Deployment

### Production Considerations
- Database connection pooling
- Redis cluster setup
- S3 bucket configuration
- SSL/TLS certificates
- Load balancer configuration
- Monitoring and logging

### Docker Deployment
```bash
docker-compose up -d
```

## API Documentation

Full API documentation is available via Swagger UI at `/api/docs` when running the application.

## Support

For technical support or questions about the dispute system:
- Email: dev-team@nexafx.com
- Documentation: [Internal Wiki]
- Issues: [GitHub Issues]
