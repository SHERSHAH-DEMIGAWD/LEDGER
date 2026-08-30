# Ledger MVP

A transaction and trust layer for brand-creator collaborations.

## Overview

Ledger facilitates verified transactions between brands and creators by providing:
- Structured deal management
- Contract generation and e-signing
- Protected payment funding
- Deliverable tracking and approval
- Dispute resolution support
- Verified transaction history

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: SQLite (MVP) / PostgreSQL (production)
- **ORM**: Prisma
- **Frontend**: React + TypeScript + Vite
- **Auth**: JWT with bcrypt password hashing
- **Payments**: Simulated during MVP development

## Project Structure

```
ledger-mvp/
├── backend/
│   ├── src/
│   │   ├── domain/          # Core business logic, entities, state machines
│   │   ├── services/        # Application services
│   │   ├── repositories/    # Data access layer
│   │   ├── middleware/      # Auth, validation, error handling
│   │   ├── routes/          # API endpoints
│   │   ├── integrations/    # External service abstractions
│   │   └── utils/           # Shared utilities
│   └── prisma/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       └── types/
└── docs/                    # Architecture and documentation
```

## Getting Started

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for full technical details.

## Status

Foundation phase - building core infrastructure only. No product features implemented yet.
