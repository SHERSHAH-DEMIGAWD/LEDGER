# Open Questions

This document tracks questions that are intentionally left unresolved for later decision. The architecture should not hard-code assumptions about these topics.

**Important**: These questions represent unresolved business/legal decisions and must NOT be converted into executable product rules. They only block the specific features that depend on them (typically dispute resolution, payment/escrow logic). They do NOT block foundational infrastructure such as authentication, authorization, profiles, deal creation, invitation, acceptance, or the core deal state machine.

## Dispute Resolution

### Q1: What is Ledger's exact role in disputes?

Not decided:
- Is Ledger a **mediator** (facilitates negotiation) or **arbitrator** (makes binding decisions)?
- Is Ledger a **platform administrator** (enforces ToS) or **observer** (only provides evidence)?
- Does Ledger have any legal authority, or is it purely contractual?

Implications for architecture:
- Determines what actions HRT can take
- Affects legal enforceability of resolutions
- Impacts liability and risk management

### Q2: What authority does the HRT have?

Not decided:
- Can HRT modify deal terms?
- Can HRT reverse payments?
- Can HRT ban users?
- Is HRT decision final or appealable?

### Q3: What happens in ambiguous/silent contract situations?

Not decided:
- If deliverables aren't clearly specified, who decides?
- If timeline is vague, how are delays judged?
- Who interprets "best effort" or subjective deliverables?

### Q4: Is there an appeal mechanism?

Not decided:
- Can a party appeal an HRT decision?
- Who hears appeals?
- What grounds for appeal are valid?

### Q5: What is the legal effect of a resolution?

Not decided:
- Does resolution constitute a binding agreement?
- Does it modify the original contract?
- Is it admissible in external legal proceedings?

## Payment & Escrow

### Q6: Who holds funds during the transaction?

Not decided:
- Does Ledger hold escrow (if legally permissible)?
- Does Ledger use a third-party escrow provider?
- Does payment happen post-delivery without escrow?

### Q7: How are partial deliverables handled?

Not decided:
- Can deals have milestone payments?
- What if only some deliverables are complete?
- How is partial approval handled?

### Q8: What happens to funds in a dispute?

Not decided:
- Are funds frozen during dispute?
- Who decides fund distribution?
- Can funds be partially released?

## Identity & Verification

### Q9: What identity verification is required?

Not decided:
- Is email verification sufficient for MVP?
- Are government IDs required for high-value deals?
- Is business verification needed for brands?

### Q10: How are minors or restricted persons handled?

Not decided:
- Age verification requirements?
- Restricted party screening?
- Geographic restrictions?

## Legal & Compliance

### Q11: What jurisdiction governs disputes?

Not decided:
- Choice of law provisions
- Arbitration vs. court
- International considerations

### Q12: What data retention requirements apply?

Not decided:
- How long are contracts stored?
- Audit log retention period?
- Right to deletion considerations?

## Technical Decisions

### Q13: How should we handle offline/async e-sign?

Not decided:
- Signature timeout period?
- What happens if a party doesn't sign?
- Reminder notifications?

### Q14: File format and size limits?

Not decided:
- What file types for deliverables?
- Size limits?
- Preview requirements?

## Priority for MVP

These questions should be resolved **before** implementing the specific features that depend on them:

**Blocking Dispute Feature**:
- **Q1-Q5**: Dispute resolution (affects dispute workflow)

**Blocking Payment Feature**:
- **Q6**: Escrow approach (affects payment integration)

**Blocking Deal Structure**:
- **Q7**: Partial deliverables (affects deal structure)

**These do NOT block foundational infrastructure** (auth, profiles, deal creation, invitation, acceptance, core state machine, authorization):

The following can be deferred post-MVP:
- Q8-Q15: Additional compliance and edge cases
