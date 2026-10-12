# Product Requirements Document (PRD)

## Project Overview: ConciergeIQ

ConciergeIQ is a smart guest experience and operations management platform designed for hospitality. It provides a seamless QR-code-driven guest interface and a dashboard for hotel staff and administrators, backed by a modular monolith API architecture.

---

## Architecture Summary
- **Monorepo**: Managed via `pnpm` workspaces
- **Apps**:
  - `apps/api`: Modular monolith backend (PostgreSQL, WebSocket, domain modules)
  - `apps/guest-web`: Lightweight React web client for guests scanning room/table QR codes
  - `apps/dashboard-web`: React management web client for staff, managers, and admins
- **Shared Packages**:
  - `packages/contracts`: Shared types, event contracts, API schemas, and WebSocket message definitions
  - `packages/tsconfig`: Shared TypeScript configurations

---

## Core Requirements & Stages
1. **Stage 1: Core Foundation**
   - QR code resolution & guest session handling
   - Service requests (room service, housekeeping, concierge requests)
   - Staff dashboard for handling live requests
   - PostgreSQL persistence
2. **Stage 2: Real-time & Escalations**
   - WebSocket real-time updates for guest & staff apps
   - Redis caching and Pub/Sub
   - SLA tracking and automated escalation rules
