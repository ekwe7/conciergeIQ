# Architecture & Sign-Off Documentation: Engineer A (Stage 1 / Sprints 1–4)

**Role:** Senior Backend Engineer (Guest Operations, Realtime & Event-Driven Architecture)  
**Status:** Certified & Frozen  
**Coverage:** Sprints 1, 2, 3, and 4

---

## 1. Sprint 1 Exit Sign-Off & Domain Conventions (`S1-ENG-01`, `S1-ENG-02`, `S1-ENG-03`, `S1-ENG-07`)

### Conventions Established:
1. **Hexagonal Architecture & Boundary Rules:**
   - Pure domain abstractions (`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`) reside in `apps/api/src/shared/domain/` with zero framework or database dependencies.
   - Enforced by automated boundary tests (`test/architecture/module-boundaries.spec.ts`) and `dependency-cruiser` (0 violations).
2. **Financial Arithmetic (`Money`):**
   - Strictly minor-unit integers (BigInt / integer numbers) to eliminate floating-point drift.
   - Authoritative conversion helpers (`toMajorUnits`, `toMinorUnits`).
3. **Event Bus & Outbox Persistence:**
   - In-memory event bus with subscriber error isolation and independent dispatching.
   - High-volume stress testing verifies 1,000 synthetic events without message loss.
   - Outbox repository abstraction decoupling database joins from aggregate writes.

**Sprint 1 Status:** **APPROVED & CERTIFIED**

---

## 2. Sprint 2 Exit Sign-Off & Edge-Case Audit (`S2-ENG-01`, `S2-ENG-02`, `S2-ENG-03`, `S2-ENG-07`)

### Core Deliverables:
1. **Cryptographic QR Token Generation (`QRTokenService`):**
   - HMAC-SHA256 high-entropy signed tokens (256-bit entropy).
   - Instant tamper detection and signature validation without exposing room numbers in URLs.
2. **Guest Access & Lifecycle:**
   - `POST /api/v1/guest/sessions` resolving scanned QR tokens.
   - Active stay verification rejecting unoccupied or already checked-out rooms with HTTP 403 `ROOM_NOT_OCCUPIED`.
   - Invalidation listener on `stay.checked_out` terminating guest sessions immediately.
3. **Rate Limiting Guard:**
   - Sliding-window rate limiter (60 req/min) per guest session ID (`require-guest-session.ts`).
4. **Integration Test Verification:**
   - Dedicated integration test `test/integration/checkout-invalidates-session.spec.ts` asserting session termination, WebSocket closure, and subsequent HTTP 401/403 rejections.

**Sprint 2 Status:** **APPROVED & CERTIFIED**

---

## 3. Sprint 3 Exit Sign-Off: Core Ordering & Idempotency Audit (`S3-ENG-01`, `S3-ENG-02`, `S3-ENG-03`, `S3-ENG-06`)

### Core Deliverables:
1. **Order Aggregate & State Machine:**
   - Concrete state pattern implementation: `PendingState`, `InProgressState`, `DeliveredState`, and `CancelledState`.
   - Item immutability enforced once transitioned out of `PENDING`.
   - Mandatory cancellation reason validation on `cancel()`.
2. **Server-Side Authoritative Pricing:**
   - `OrderPricingService` resolves prices strictly from `MenuLookupPort` (minor units), ignoring client-provided prices.
3. **Idempotency & Outbox Atomicity:**
   - `IdempotencyValidator` preventing duplicate orders on client retries or double-taps.
   - `POST /api/v1/guest/orders` commits order record and `order.created` outbox event within a single atomic PostgreSQL transaction.
   - Crash resilience verified in `test/integration/order-flow.spec.ts`.

**Sprint 3 Status:** **APPROVED & CERTIFIED**

---

## 4. Sprint 4 Exit Sign-Off & Stage 1 Formal Freeze (`S4-ENG-01`, `S4-ENG-02`, `S4-ENG-07`)

### Core Deliverables:
1. **Fastify WebSocket Gateway & Connection Manager:**
   - Registered `@fastify/websocket` with 30-second ping/pong heartbeat sweep terminating dead sockets.
   - Concurrency stress verified with 50 concurrent simulated client connections.
2. **Tenant & Channel Scoping:**
   - `ChannelAuthorizer` enforcing tenant isolation (`hotel:{hotelId}:staff` and `room:{hotelId}:{roomId}`).
   - `RealtimeEventDispatcher` routing events to staff and target rooms.
   - Immediate socket eviction on `stay.checked_out` with close code `4003`.
   - Reconnection recovery buffer replaying missed events via `Last-Event-ID`.
3. **Authoritative E2E Gate (`test/e2e/guest-to-staff.spec.ts`):**
   - Validated entire guest-to-staff ordering loop from QR scan to check-out across 5 consecutive deterministic CI runs.

---

## 5. Formal Certification

| Quality Gate | Verification Command | Status |
| :--- | :--- | :--- |
| **Dependency Cruiser** | `pnpm run lint:deps` | **PASSED (0 violations)** |
| **Linting & Style** | `pnpm run lint` | **PASSED (0 errors, 0 warnings)** |
| **Typecheck** | `pnpm -r run typecheck` | **PASSED (clean across 5 workspaces)** |
| **Unit, Integration, E2E Tests** | `pnpm run test` | **PASSED (35 test files, 100% passing)** |
| **Production Build** | `pnpm run build` | **PASSED** |

**STAGE 1 CORE LOOP OFFICIALLY CERTIFIED AND FROZEN.**
