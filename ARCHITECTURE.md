# Architecture Document

## Design Principles

1. **Domain-Centric**: Architecture centered around the Deal/Transaction lifecycle
2. **State Machine**: Explicit transaction states with validated transitions
3. **Auditability**: All critical events recorded with actor, timestamp, and context
4. **Security by Default**: Server-side enforcement, no client trust
5. **Replaceable Integrations**: External services abstracted behind interfaces

## Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL (Recommended — see ADR-004)
- **Auth**: JWT with bcrypt (see ADR-019 for full session design)
- **Validation**: Zod

### Frontend
- **Framework**: React 18+
- **Language**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State**: React Context + hooks (no Redux for MVP)

### Infrastructure
- **Environment**: Node.js process environment variables
- **Secrets**: Environment variables only, never in code
- **Config**: Type-safe configuration management

## Project Structure

```
backend/
├── src/
│   ├── domain/
│   │   ├── entities/           # Core domain models
│   │   │   ├── User.ts
│   │   │   ├── Deal.ts
│   │   │   ├── Contract.ts
│   │   │   ├── Deliverable.ts
│   │   │   ├── Dispute.ts
│   │   │   └── AuditLog.ts
│   │   ├── state-machine/       # Deal state machine
│   │   │   └── DealStateMachine.ts
│   │   ├── value-objects/      # Immutable value types
│   │   │   ├── Money.ts
│   │   │   ├── DealTerms.ts
│   │   │   └── ContractVersion.ts
│   │   └── errors/             # Domain-specific errors
│   │
│   ├── services/               # Application services
│   │   ├── AuthService.ts
│   │   ├── DealService.ts
│   │   ├── ContractService.ts
│   │   ├── DeliverableService.ts
│   │   ├── DisputeService.ts
│   │   └── PaymentService.ts   # Abstract interface
│   │
│   ├── repositories/           # Data access
│   │   ├── UserRepository.ts
│   │   ├── DealRepository.ts
│   │   └── ContractRepository.ts
│   │
│   ├── middleware/             # Express middleware
│   │   ├── auth.ts             # JWT verification
│   │   ├── authorize.ts        # Role-based access
│   │   ├── validate.ts         # Input validation
│   │   └── errorHandler.ts     # Global error handling
│   │
│   ├── routes/                 # API endpoints
│   │   ├── auth.routes.ts
│   │   ├── deal.routes.ts
│   │   ├── contract.routes.ts
│   │   ├── deliverable.routes.ts
│   │   └── dispute.routes.ts
│   │
│   ├── integrations/           # External service interfaces
│   │   ├── payment/
│   │   │   ├── PaymentProvider.ts  # Interface
│   │   │   └── SimulatedPayment.ts  # MVP implementation
│   │   ├── esign/
│   │   │   ├── ESignProvider.ts     # Interface
│   │   │   └── MockESign.ts         # MVP implementation
│   │   ├── storage/
│   │   │   ├── StorageProvider.ts   # Interface
│   │   │   └── LocalStorage.ts      # MVP implementation
│   │   └── identity/
│   │       └── IdentityProvider.ts  # Interface
│   │
│   └── utils/
│       ├── config.ts
│       └── logger.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── tests/
    ├── unit/
    └── integration/

frontend/
├── src/
│   ├── components/          # Reusable UI components
│   ├── pages/               # Route pages
│   ├── hooks/               # Custom React hooks
│   ├── services/            # API client
│   ├── contexts/            # React contexts
│   ├── types/               # Shared TypeScript types
│   └── utils/
│
└── index.html
```

## Domain Model

### Core Entities

```
User
├── id: UUID
├── email: String (unique)
├── passwordHash: String
├── role: Enum (BRAND, CREATOR, HRT, ADMIN)
├── profile: UserProfile
├── createdAt: DateTime
└── updatedAt: DateTime

Deal
├── id: UUID
├── brandId: UUID (FK)
├── creatorId: UUID (FK, nullable)
├── status: Enum (see state machine)
├── terms: DealTerms (versioned)
├── contractId: UUID (FK, nullable)
├── fundingStatus: Enum
├── createdAt: DateTime
├── updatedAt: DateTime
└── versions: DealVersion[]

Contract
├── id: UUID
├── dealId: UUID (FK)
├── currentVersionId: UUID (FK)
├── versions: ContractVersion[]
└── status: Enum (DRAFT, PENDING_SIGNATURES, SIGNED, EXECUTED)

ContractVersion
├── id: UUID
├── contractId: UUID (FK)
├── versionNumber: Int
├── terms: JSON
├── content: String
├── signatures: Signature[]
├── createdAt: DateTime
└── isFinal: Boolean

Deliverable
├── id: UUID
├── dealId: UUID (FK)
├── creatorId: UUID (FK)
├── status: Enum
├── content: JSON
├── submittedAt: DateTime
└── versions: DeliverableVersion[]

Dispute
├── id: UUID
├── dealId: UUID (FK)
├── creatorId: UUID (FK)
├── brandId: UUID (FK)
├── status: Enum
├── evidence: Evidence[]
├── resolution: Resolution (nullable)
├── createdAt: DateTime
└── resolvedAt: DateTime

AuditLog
├── id: UUID
├── actorId: UUID (FK)
├── action: String
├── resourceType: String
├── resourceId: UUID
├── metadata: JSON
├── timestamp: DateTime
└── ipAddress: String
```

## State Machine Design

### Deal State Machine

```
States:
- DRAFT
- PENDING_ACCEPTANCE
- ACCEPTED
- DECLINED (terminal)
- FUNDED
- IN_PROGRESS
- SUBMITTED
- APPROVED
- REVISION_REQUESTED
- DISPUTED
- RESOLVED
- COMPLETED (terminal)
- CANCELLED (terminal)

Transitions are defined in PRODUCT_RULES.md.
All transitions are validated server-side with:
1. Current state check
2. Actor authorization
3. Required conditions verification
4. Side effect execution
5. Audit log creation
```

### State Transition Enforcement

```typescript
interface StateTransition {
  from: DealStatus;
  to: DealStatus;
  allowedRoles: Role[];
  requiredConditions: Condition[];
  sideEffects: SideEffect[];
}

class DealStateMachine {
  transition(deal: Deal, action: string, actor: User, context: Context): Result {
    // 1. Authenticate actor
    // 2. Load authoritative deal state
    // 3. Verify transition validity
    // 4. Check required conditions
    // 5. Execute side effects
    // 6. Persist new state
    // 7. Create audit log
  }
}
```

## Security Architecture

### Authentication
- JWT with access tokens (15-minute expiry) and refresh tokens (7-day expiry)
- Refresh token rotation on each use
- Tokens stored in httpOnly cookies with CSRF protection
- Passwords hashed with bcrypt (cost factor 12) or Argon2
- Login rate limiting: 5 attempts per 15 minutes per IP
- Password reset via time-limited email tokens (1-hour expiry)
- Email verification required before first deal creation
- Token revocation on password change or logout

### Authorization Model
See ADR-017 for detailed HRT vs Admin separation.

```
User
  └── Role (BRAND | CREATOR | HRT | ADMIN)
        └── Permissions per role

Role Permissions Matrix:

| Action                  | Brand | Creator | HRT | Admin |
|------------------------|-------|---------|-----|-------|
| Create deal            | ✓     | ✗       | ✗   | ✓     |
| Accept deal            | ✗     | ✓       | ✗   | ✗     |
| Submit deliverable     | ✗     | ✓       | ✗   | ✗     |
| Approve deliverable    | ✓     | ✗       | ✗   | ✗     |
| Request revision       | ✓     | ✗       | ✗   | ✗     |
| Raise dispute          | ✓     | ✗       | ✗   | ✗     |
| View dispute           | ✓*    | ✓*      | ✓   | ✓     |
| Resolve dispute        | ✗     | ✗       | ✗   | ✓     |
| View audit logs        | ✗     | ✗       | ✗   | ✓     |
| Manage users           | ✗     | ✗       | ✗   | ✓     |

* Limited to own deals only
```

### HRT vs Admin Capabilities
**HRT (Human Review Team)**:
- Views all disputes and provides resolution recommendations
- Cannot unilaterally modify deal terms
- Cannot reverse payments or ban users
- Cannot manage users or view audit logs
- Business role focused on dispute resolution

**Admin**:
- Views all disputes and can resolve them (acting on HRT recommendations)
- Views audit logs and manages user accounts (suspend, ban)
- Has elevated system permissions
- Technical role focused on system maintenance
- Cannot unilaterally modify deal terms (same restriction as HRT)

### Resource Ownership Rules
```
Deal:
  - Brand owner: full control
  - Invited Creator: read + submit deliverables
  - Others: no access

Contract:
  - Brand owner: full control
  - Creator (if invited): read + sign
  - Others: no access

Deliverable:
  - Creator owner: full control
  - Brand owner: read + approve/reject
  - Others: no access

Dispute:
  - Deal participants: read own involvement
  - HRT: full read access + can provide recommendations
  - Admin: full read access + can resolve disputes
```

### Security Middleware Chain
All security enforced server-side:
```
Request → Auth Middleware → Authorization Middleware → Validation → Handler
              ↓                    ↓                      ↓
         Verify JWT           Check Role           Validate Input
         Load User           Check Resource        Sanitize Data
                              Ownership
```

### Security Enforcement Principles
1. **Server-side only**: No client-trusted authorization decisions
2. **Object-level checks**: Verify resource ownership before any operation
3. **Action-level checks**: Different operations require different permissions
4. **State transition validation**: Only valid deal state transitions allowed
5. **No implicit permissions**: Default deny, explicit allow

## Integration Architecture

### Provider Interfaces

All external services implement a common interface:

```typescript
interface PaymentProvider {
  createPaymentIntent(amount: Money, dealId: string): Promise<PaymentIntent>;
  confirmPayment(intentId: string): Promise<PaymentResult>;
  refundPayment(paymentId: string): Promise<RefundResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}

interface ESignProvider {
  createEnvelope(contract: ContractVersion): Promise<Envelope>;
  getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus>;
  getSignedDocument(envelopeId: string): Promise<Document>;
}

interface StorageProvider {
  uploadFile(file: Buffer, metadata: FileMetadata): Promise<FileHandle>;
  getFile(handle: FileHandle): Promise<Buffer>;
  deleteFile(handle: FileHandle): Promise<void>;
}
```

### MVP Implementations

- **Payment**: SimulatedPayment - stores state in memory/DB, logs operations
- **ESign**: MockESign - accepts any signature, no external calls
- **Storage**: LocalStorage - filesystem storage with UUID keys

## Database Design

### Prisma Schema Overview

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  role          Role
  profile       Json
  dealsAsBrand  Deal[]    @relation("BrandDeals")
  dealsAsCreator Deal[]   @relation("CreatorDeals")
  auditLogs     AuditLog[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Deal {
  id              String      @id @default(uuid())
  brandId         String
  brand           User        @relation("BrandDeals", fields: [brandId], references: [id])
  creatorId       String?
  creator         User?       @relation("CreatorDeals", fields: [creatorId], references: [id])
  status          DealStatus
  // NOTE: Deal terms are NOT stored here. DealVersion is the authoritative source for versioned terms.
  contractId      String?
  contract        Contract?   @relation(fields: [contractId], references: [id])
  fundingStatus   FundingStatus
  auditLogs       AuditLog[]
  versions        DealVersion[]  // Versioned deal terms
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model Contract {
  id              String      @id @default(uuid())
  dealId          String      @unique
  deal            Deal        @relation(fields: [dealId], references: [id])
  versions        ContractVersion[]
  status          ContractStatus
}

model ContractVersion {
  id              String      @id @default(uuid())
  contractId      String
  contract        Contract    @relation(fields: [contractId], references: [id])
  versionNumber   Int
  terms           Json
  content         String?
  signatures      Json?
  isFinal         Boolean
  createdAt       DateTime    @default(now())
}

model Deliverable {
  id              String      @id @default(uuid())
  dealId          String
  creatorId       String
  status          DeliverableStatus
  content         Json
  submittedAt     DateTime    @default(now())
}

model Dispute {
  id              String      @id @default(uuid())
  dealId          String
  creatorId       String
  brandId         String
  status          DisputeStatus
  evidence        Json
  resolution      Json?
  createdAt       DateTime    @default(now())
  resolvedAt      DateTime?
}

model AuditLog {
  id              String      @id @default(uuid())
  actorId         String
  actor           User        @relation(fields: [actorId], references: [id])
  dealId          String?
  deal            Deal?       @relation(fields: [dealId], references: [id])
  action          String
  resourceType    String
  resourceId      String
  metadata        Json
  ipAddress       String?
  timestamp       DateTime    @default(now())
}
```

## API Design

### RESTful Endpoints

```
Authentication:
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

Deals:
GET    /api/deals                 # List user's deals
POST   /api/deals                 # Create deal (Brand only)
GET    /api/deals/:id             # Get deal details
PUT    /api/deals/:id             # Update draft deal
POST   /api/deals/:id/invite      # Invite creator
POST   /api/deals/:id/accept      # Accept deal (Creator)
POST   /api/deals/:id/decline     # Decline deal (Creator)
POST   /api/deals/:id/fund        # Fund deal (Brand)
POST   /api/deals/:id/submit      # Submit deliverable (Creator)
POST   /api/deals/:id/approve     # Approve (Brand)
POST   /api/deals/:id/revise      # Request revision (Brand)
POST   /api/deals/:id/dispute     # Raise dispute (Brand)

Contracts:
GET    /api/deals/:id/contract
POST   /api/deals/:id/contract/versions
POST   /api/contracts/:id/sign
GET    /api/contracts/:id/versions

Deliverables:
GET    /api/deals/:id/deliverables
POST   /api/deals/:id/deliverables
GET    /api/deliverables/:id

Disputes:
GET    /api/deals/:id/dispute
POST   /api/deals/:id/dispute
GET    /api/disputes              # HRT/Admin only
POST   /api/disputes/:id/evidence
POST   /api/disputes/:id/resolve  # HRT only

Users:
GET    /api/users/me
PUT    /api/users/me/profile

Admin:
GET    /api/admin/audit-logs
GET    /api/admin/users
```

### Request/Response Patterns

All responses follow:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

## Error Handling

### Error Codes

```typescript
enum ErrorCode {
  // Authentication
  INVALID_CREDENTIALS = 'AUTH_001',
  TOKEN_EXPIRED = 'AUTH_002',
  TOKEN_INVALID = 'AUTH_003',
  
  // Authorization
  UNAUTHORIZED = 'AUTH_010',
  FORBIDDEN = 'AUTH_011',
  INSUFFICIENT_PERMISSIONS = 'AUTH_012',
  
  // Resource
  NOT_FOUND = 'RES_001',
  ALREADY_EXISTS = 'RES_002',
  
  // State
  INVALID_TRANSITION = 'STATE_001',
  PRECONDITION_FAILED = 'STATE_002',
  
  // Validation
  VALIDATION_ERROR = 'VAL_001',
  
  // Internal
  INTERNAL_ERROR = 'SYS_001',
}
```

### Error Response

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown; // Never includes secrets
  };
}
```

## Concurrency Considerations

1. **Optimistic Locking**: Use version fields on entities
2. **Database Transactions**: Critical operations wrapped in transactions
3. **Idempotency**: Key-based idempotency for payment operations
4. **Race Condition Prevention**: State transitions checked atomically

## Audit Trail

### What Gets Logged

- Authentication events (login, logout, failed attempts)
- Deal creation, state transitions
- Contract creation, signing
- Deliverable submissions
- Dispute creation, evidence, resolution
- Payment operations
- Admin actions

### What Gets Excluded

- Password values (even hashed)
- API keys or tokens
- Session details
- IP addresses (optional, privacy consideration)

## Immutability Guarantees

1. **Signed contracts**: Never modified after signatures collected
2. **Audit logs**: Append-only
3. **Delivered deliverables**: Stored as immutable versions
4. **Dispute evidence**: Timestamped and uneditable

## Environment Variables

```
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=file:./dev.db

# JWT
JWT_SECRET=<required>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# External Services (optional for MVP)
PAYMENT_PROVIDER=simulated
ESIGN_PROVIDER=mock
STORAGE_PROVIDER=local
```

## Security Checklist

- [x] All passwords hashed with bcrypt
- [x] JWT with short expiry
- [x] Server-side authorization on all endpoints
- [x] Resource ownership verification
- [x] Input validation on all requests
- [x] No secrets in code
- [x] Error messages don't leak internals
- [x] Audit logging for critical actions
- [x] Immutable contracts and audit logs
- [x] State machine prevents invalid transitions
