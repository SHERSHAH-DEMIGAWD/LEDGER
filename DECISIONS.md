# Architectural Decisions

This document records significant technical decisions, the context that drove them, and the tradeoffs considered.

---

## ADR-001: TypeScript as Primary Language

**Status**: Accepted

**Context**: Building a production-capable MVP with type safety requirements.

**Decision**: Use TypeScript in strict mode for both backend and frontend.

**Rationale**:
- Catch type errors at compile time rather than runtime
- Better IDE support and refactoring safety
- Self-documenting code through types
- Reduce bugs in authorization and domain logic

**Tradeoffs**:
- Learning curve for team members unfamiliar with TypeScript
- Compilation step adds to build time
- Some flexibility lost vs. dynamic typing

---

## ADR-002: Express.js as HTTP Framework

**Status**: Accepted

**Context**: Need a lightweight, battle-tested HTTP framework.

**Decision**: Use Express.js for the API layer.

**Rationale**:
- Mature ecosystem with well-understood patterns
- Extensive middleware availability
- Easy to understand and maintain
- Sufficient for MVP scale
- Not over-engineered for requirements

**Tradeoffs**:
- Less opinionated than NestJS/Fastify
- Manual structure required (mitigated by layered architecture)
- Async error handling requires explicit attention

---

## ADR-003: Prisma ORM

**Status**: Accepted

**Context**: Need type-safe database access with migration support.

**Decision**: Use Prisma as the ORM.

**Rationale**:
- First-class TypeScript support
- Automatic type generation from schema
- Migration system with version control
- Type-safe queries with generated types
- Easy to switch databases (SQLite → PostgreSQL)

**Tradeoffs**:
- Additional abstraction layer
- Query performance less optimized than raw SQL
- Some Prisma-specific patterns to learn

---

## ADR-004: Database Selection - SQLite vs PostgreSQL

**Status**: Proposed (Pending Decision)

**Context**: Need to choose between SQLite (simple local dev) and PostgreSQL (production-ready) for Ledger's transactional requirements.

**Decision**: **RECOMMENDED - Use PostgreSQL for both development and production** to avoid migration complexity and ensure consistent behavior.

**Tradeoffs Analysis**:

**SQLite Advantages**:
- Zero-configuration local development
- Single file database (easy backup/version control)
- Simpler setup for individual developers

**SQLite Disadvantages**:
- Limited concurrent write support (database locked during writes)
- Weaker transaction isolation compared to PostgreSQL
- Some Prisma advanced features PostgreSQL-only
- Risk of production behavior differing from development

**PostgreSQL Advantages**:
- Production-grade concurrency and transaction support
- Consistent behavior between dev and prod environments
- Full feature support with Prisma
- Better tooling and monitoring capabilities
- Handles Ledger's transactional workload naturally

**PostgreSQL Disadvantages**:
- Slightly more complex local setup (requires Postgres instance)
- Marginally more resource usage in development

**Migration Consideration**:
If starting with SQLite, migrating to PostgreSQL later requires:
1. Data export/import process
2. Potential schema adjustments
3. Testing for behavioral differences
4. Risk of undiscovered inconsistencies

**Recommendation**: Use PostgreSQL from the start to eliminate migration risk and ensure development environment accurately reflects production behavior for transactional workloads.

---

## ADR-005: JWT Authentication

**Status**: Accepted

**Context**: Stateless API authentication with reasonable security.

**Decision**: Use JWT with access tokens (15min) and refresh tokens (7 days).

**Rationale**:
- Stateless - scales horizontally
- Standard industry practice
- Refresh tokens allow session extension without re-auth
- Token blacklisting for logout support

**Tradeoffs**:
- Tokens stored client-side (vulnerable to XSS)
- Token revocation not immediate (mitigated by short expiry)
- Refresh token rotation complexity

---

## ADR-006: Simulated Payments

**Status**: Accepted

**Context**: MVP should not integrate real payment processing.

**Decision**: Abstract payment operations behind PaymentProvider interface; implement SimulatedPayment.

**Rationale**:
- MVP focus is workflow, not payments
- Real payments require compliance (PCI-DSS)
- Allows testing full flow without financial risk
- Easy to swap in real provider later

**Tradeoffs**:
- Not representative of real payment UX
- No actual money movement
- Must clearly mark simulated in UI

---

## ADR-007: State Machine for Deal Lifecycle

**Status**: Accepted

**Context**: Deal state transitions must be strictly controlled.

**Decision**: Explicit state machine with validated transitions.

**Rationale**:
- Clear state model prevents invalid states
- All transitions validated server-side
- Easy to audit what actions are possible from any state
- Self-documenting business rules

**Tradeoffs**:
- More upfront design work
- Adding new states requires code changes
- May feel rigid for edge cases

---

## ADR-008: Audit Logging for Critical Events

**Status**: Accepted

**Context**: Critical business events must be traceable.

**Decision**: All significant actions create immutable audit log entries.

**Rationale**:
- Required for dispute evidence
- Enables accountability
- Supports compliance requirements
- Useful for debugging

**Tradeoffs**:
- Database storage grows over time
- Logging all actions has performance cost
- Need to define "significant" boundaries

---

## ADR-009: Immutable Contract Versions

**Status**: Accepted

**Context**: Signed agreements must not be silently modified.

**Decision**: Contracts stored as immutable versions; modifications create new versions.

**Rationale**:
- Legal documents must be stable
- Prevents "he said, she said" disputes
- Clear trail of what was agreed
- Supports audit requirements

**Tradeoffs**:
- More complex versioning logic
- Higher storage for contract history
- More complex querying of "current" terms

---

## ADR-010: Server-Side Authorization Only

**Status**: Accepted

**Context**: Client-side security can always be bypassed.

**Decision**: All authorization enforced server-side; frontend only reflects permissions for UX.

**Rationale**:
- Only secure approach
- API cannot trust any client data
- Clear security boundary
- Easier to audit and test

**Tradeoffs**:
- More boilerplate authorization checks
- Performance cost of checks on every request
- Some client-side logic duplicated server-side

---

## ADR-017: Separate HRT from Admin Capabilities

**Status**: Accepted

**Context**: HRT (Human Review Team) and Admin are often conflated in authorization systems. They have fundamentally different scopes.

**Decision**: Separate HRT capabilities from general Admin capabilities:
- **Admin**: System administration (user management, audit log access, configuration)
- **HRT**: Dispute review and resolution (specific to deal disputes)
- **Overlap**: Both can view disputes, but only HRT can resolve them (Admin can technically override for system integrity)

**Rationale**:
- HRT is a business role, Admin is a technical role
- Different access patterns and audit requirements
- Prevents confusion about who can make what decisions
- Supports separation of concerns

**Tradeoffs**:
- More role definitions to maintain
- Overlap cases need clear policy
- Requires explicit decision about Admin vs HRT authority

---

## ADR-018: Deal State and Payment State Separated

**Status**: Accepted

**Context**: Deal lifecycle and payment lifecycle are related but distinct concerns.

**Decision**: Maintain separate state machines for:
- `Deal.status` - the deal lifecycle (DRAFT → ... → COMPLETED)
- `Deal.fundingStatus` - the payment/funding state (NOT_FUNDED → FUNDED → REFUNDED)

**Rationale**:
- Deal can be in dispute while payment remains funded
- Payment can be refunded while deal is still active
- Different actors drive different state machines
- Prevents coupling between business workflow and financial operations

**Tradeoffs**:
- More state to track
- Need to ensure consistency between the two state machines
- More complex queries filtering by both states

---

## ADR-019: Authentication Session Architecture

**Status**: Proposed (Pending Implementation Decision)

**Context**: JWT alone is not a complete security design. Need to explicitly define session management, token storage, and security controls before implementing authentication.

**Decision**: PROPOSED - JWT with short-lived access tokens + refresh token rotation, stored in httpOnly cookies.

**Required Design Decisions Before Implementation**:

### Token Architecture
| Aspect | Decision Needed | Recommendation |
|--------|----------------|----------------|
| Access token lifetime | How short? | 15 minutes |
| Refresh token lifetime | How long? | 7 days |
| Refresh token rotation | Rotate on each use? | Yes |
| Token storage location | Where tokens live | httpOnly cookies (not localStorage) |
| Token transport | How sent | Cookie-based (not Authorization header) |

### Security Controls
| Control | Decision Needed | Recommendation |
|---------|----------------|----------------|
| Login rate limiting | How strict? | 5 attempts per 15 min per IP |
| Password requirements | Minimum standards? | 8+ chars, mixed case, number |
| Password hashing | Algorithm/rounds? | Argon2 or bcrypt cost 12 |
| Account lockout | After how many failures? | 5 failures = 15 min lockout |
| Session invalidation | On password change? | Yes, invalidate all sessions |
| Concurrent sessions | Limit per user? | Max 5 active sessions |

### Email/Identity Verification
| Aspect | Decision Needed | Recommendation |
|---------|----------------|----------------|
| Email verification | Required for login? | Yes, before first deal |
| Verification token lifetime | How long valid? | 24 hours |
| Password reset flow | Mechanism? | Email link with signed token |
| Password reset token lifetime | How long valid? | 1 hour |
| Resend verification | Rate limit? | Max 3 per 24 hours |

### Implementation Prerequisites
Before implementing auth, document:
1. Token storage strategy (httpOnly cookies with CSRF protection)
2. Refresh token rotation mechanism
3. Token revocation list or approach
4. Password reset token signing and validation
5. Rate limiting strategy for login/registration
6. Session invalidation on security events

**Recommendation**: Finalize this design document before implementing auth endpoints.

---

## ADR-011: Repository Pattern for Data Access

**Status**: Proposed (Pending Evaluation)

**Context**: Need clean separation between domain logic and data access. However, this may be unnecessary abstraction for an MVP with Prisma's type-safe queries.

**Decision**: PROPOSED - Use repository pattern; domain never directly queries database.

**Rationale**:
- Testability - can mock repositories
- Clear data access boundaries
- Easier to swap data layer if needed
- Domain logic stays pure

**Tradeoffs**:
- Additional abstraction layer
- May feel like over-engineering for simple queries
- Two places to modify for schema changes
- Prisma already provides type-safe query layer

**Recommendation**: Evaluate if direct Prisma usage in services is sufficient for MVP.

---

## ADR-012: Service Layer Pattern

**Status**: Accepted

**Context**: Need orchestration layer between controllers and domain.

**Decision**: Services coordinate between repositories, domain logic, and external services.

**Rationale**:
- Thin controllers (just HTTP handling)
- Business logic in testable services
- Transaction management in services
- Clear dependency injection points

**Tradeoffs**:
- More files and structure
- Some logic may be duplicated in multiple services
- Service vs. domain logic distinction can be fuzzy

---

## ADR-013: Environment Variables for Configuration

**Status**: Accepted

**Context**: Must not hard-code secrets or environment-specific config.

**Decision**: All configuration via environment variables; TypeScript config module.

**Rationale**:
- Secrets never in code
- Different configs for dev/staging/prod
- Standard twelve-factor app pattern
- Easy to swap for secret manager later

**Tradeoffs**:
- Environment setup complexity
- Missing env vars cause cryptic runtime errors
- Need validation of required vars

---

## ADR-014: Zod for Validation

**Status**: Accepted

**Context**: Need runtime validation of external input.

**Decision**: Use Zod for schema validation on API boundaries.

**Rationale**:
- TypeScript-first (inference from schemas)
- Composable schemas
- Sanitization built-in
- Error messages can be user-friendly

**Tradeoffs**:
- Additional dependency
- Schema definition can feel redundant with types
- Runtime validation has performance cost

---

## ADR-015: React Context for State Management

**Status**: Accepted

**Context**: MVP doesn't need complex state management.

**Decision**: Use React Context + hooks; no Redux/others.

**Rationale**:
- Sufficient for MVP complexity
- No additional dependencies
- Easier to understand and maintain
- Can migrate to more complex solution later

**Tradeoffs**:
- Context performance considerations for frequent updates
- No built-in devtools for debugging
- May need refactoring as complexity grows

---

## ADR-016: Vite for Build Tooling

**Status**: Accepted

**Context**: Modern, fast build tooling for React.

**Decision**: Use Vite for frontend development and building.

**Rationale**:
- Fast HMR for development
- Simple configuration
- Native TypeScript support
- Modern ESM-based

**Tradeoffs**:
- Less battle-tested than Webpack
- Some ecosystem compatibility issues
- New tooling to learn

---

## Pending Decisions

The following are recorded as "proposed" pending resolution of open questions:

| ID | Topic | Status | Blocking |
|----|-------|--------|----------|
| D-001 | Dispute authority scope | Pending Q1-Q2 | Dispute feature |
| D-002 | Escrow approach | Pending Q6 | Payment feature |
| D-003 | Milestone/partial payments | Pending Q7 | Payment feature |
| D-004 | Appeal mechanism | Pending Q4 | Dispute feature |
