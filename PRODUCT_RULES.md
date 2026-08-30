# Product Rules

## Core Principles

1. **Ledger is NOT a creator marketplace**
   - Brands and creators may already know each other
   - Ledger provides the transaction/trust layer, not discovery

2. **MVP is intentionally narrow**
   - Focus on verified transactions between known parties
   - No creator search, AI matching, or marketplace features

3. **Legal authority is not assumed**
   - Ledger does not claim to be a mediator, arbitrator, or legal authority
   - HRT role and dispute resolution mechanisms are intentionally open

## User Roles

### Brand
- Can create deals
- Can invite creators to deals
- Can review deliverables
- Can approve/request revision or raise dispute
- Cannot perform creator actions

### Creator
- Can accept/decline deal invitations
- Can submit deliverables
- Cannot approve their own deliverables
- Cannot access another creator's deals

### HRT (Human Review Team)
- Can view disputes (all deals)
- Can provide resolution recommendations
- Cannot unilaterally modify deal terms
- Cannot access arbitrary user data
- Cannot reverse payments (requires external authority)

### Admin
- Can view disputes (all deals)
- Can resolve disputes (operates on HRT behalf)
- Can view audit logs
- Can manage users (suspend, ban)
- Has elevated system permissions

**Key Difference**: HRT provides dispute resolution recommendations. Admin can execute system-level actions including resolving disputes and managing users. HRT does not have user management capabilities.

## Deal Lifecycle States

```
DRAFT → PENDING_ACCEPTANCE → ACCEPTED → FUNDED → IN_PROGRESS → 
SUBMITTED → APPROVED | REVISION_REQUESTED | DISPUTED → RESOLVED → COMPLETED
```

### State Transitions

| From | To | Actor | Conditions |
|------|----|-------|------------|
| DRAFT | PENDING_ACCEPTANCE | Brand | Deal terms finalized, invitation sent |
| PENDING_ACCEPTANCE | ACCEPTED | Creator | Invitation accepted |
| PENDING_ACCEPTANCE | DECLINED | Creator | Invitation declined (terminal) |
| ACCEPTED | FUNDED | Brand | Payment secured |
| FUNDED | IN_PROGRESS | System | Funding confirmed |
| IN_PROGRESS | SUBMITTED | Creator | Deliverable submitted |
| SUBMITTED | APPROVED | Brand | Deliverable accepted |
| SUBMITTED | REVISION_REQUESTED | Brand | Revision requested |
| SUBMITTED | DISPUTED | Brand | Dispute raised |
| REVISION_REQUESTED | SUBMITTED | Creator | Revised deliverable submitted |
| DISPUTED | RESOLVED | HRT | Resolution provided |
| RESOLVED | APPROVED | System | Resolution accepted |
| RESOLVED | COMPLETED | Brand | Payment released |
| RESOLVED | IN_PROGRESS | Creator | Re-work required |
| APPROVED | COMPLETED | System | Payment released (terminal) |

## Contract Rules

1. **Versioning**: All contract versions are immutable once signed
2. **Mutations**: Changes require a new version and re-signature
3. **Finality**: Signed contracts cannot be silently modified
4. **Terms**: Must include deliverable specifications, timeline, payment amount

## Payment Rules

1. **Simulated in MVP**: No real payment processing
2. **Abstraction**: All payment operations through PaymentService
3. **No escrow assumption**: Ledger does not legally hold funds
4. **Independent state machine**: Payment state tracked separately from deal state

## Dispute Rules (Open)

The following are NOT decided and should not be hard-coded:

- Exact HRT authority and decision scope
- Whether Ledger makes binding or advisory decisions
- Appeal mechanism structure
- Treatment of ambiguous/silent contracts
- Final legal effect of resolution

## Explicitly Out of V1 Scope

- Creator marketplace/discovery
- AI matching or recommendations
- Agency multi-seat tooling
- Social features
- Advanced analytics
- Tax automation
- Multi-currency
- Complex liquidity systems

## Authorization Rules

1. **Server-side enforcement**: All authorization happens server-side
2. **No client trust**: Never trust client-provided role, state, or permissions
3. **Resource ownership**: Users only access authorized resources
4. **Object-level checks**: Verify ownership before any operation
5. **Action-level checks**: Different operations require different permissions
6. **State transition validation**: Only valid transitions allowed
