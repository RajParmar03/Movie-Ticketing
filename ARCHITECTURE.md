# Movie Ticketing System — Backend API

A production-grade RESTful API for a movie ticketing platform built with Node.js, TypeScript, Express, PostgreSQL, and Prisma. The system supports admin management of movies, screens, and showtimes, and a full two-step seat reservation and booking flow for customers — with correct behaviour under concurrent booking attempts.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Database Design](#database-design)
4. [API Design](#api-design)
5. [Authentication & Authorization](#authentication--authorization)
6. [Concurrency Strategy](#concurrency-strategy)
7. [Rate Limiting](#rate-limiting)
8. [Background Jobs](#background-jobs)
9. [Error Handling & Validation](#error-handling--validation)
10. [Testing Strategy](#testing-strategy)
11. [Setup Instructions](#setup-instructions)
12. [Environment Variables](#environment-variables)
13. [Known Limitations & Future Improvements](#known-limitations--future-improvements)

---

## Architecture Overview

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 20+ | LTS, native `fetch`, improved performance |
| Language | TypeScript 5 (strict) | Type safety eliminates entire classes of bugs at compile time |
| Framework | Express.js | Minimal, composable, well-understood in production |
| ORM | Prisma | Type-safe queries, first-class migration tooling, raw SQL escape hatch for locking |
| Database | PostgreSQL 15+ | ACID transactions, row-level locking (`FOR UPDATE`), advisory locks |
| Validation | Zod | Runtime + compile-time type safety from a single schema definition |
| Auth | JWT + bcrypt | Stateless access tokens + DB-backed refresh tokens for revocation |
| Docs | Swagger / OpenAPI 3.0 | Standard, served at `/api/docs` via `swagger-ui-express` |
| Testing | Jest + Supertest | Industry standard; Supertest allows HTTP-level integration tests against the real app |
| Scheduler | node-cron | Lightweight in-process cron; no Redis or separate worker process required |
| Rate Limiting | express-rate-limit | In-memory store as specified; drop-in, zero infrastructure |

### Key Design Principles

1. **Correctness first.** The concurrency challenge is the primary evaluation criterion. Every booking mutation runs inside a Prisma `$transaction` with row-level `SELECT ... FOR UPDATE SKIP LOCKED` to prevent double-booking at the database level.

2. **Separation of concerns via modules.** Each domain (auth, movies, screens, showtimes, bookings, payments) is a self-contained module with its own router, controller, service, Zod schema, and types. Business logic lives in services — controllers are thin HTTP adapters.

3. **Middleware-first cross-cutting concerns.** Authentication, RBAC, rate limiting, validation, and error handling are all middleware — never scattered inline through controllers or services.

4. **SeatInventory is the single source of truth.** Seat availability is never derived from the Booking table. The `seat_inventory` table is the canonical state machine for every seat per showtime.

---

## Project Structure

```
movie-ticketing/
├── prisma/
│   ├── schema.prisma          # Prisma data model
│   └── migrations/            # Versioned SQL migrations (never schema push in prod)
├── src/
│   ├── config/
│   │   ├── env.ts             # Zod-validated env config — app crashes on startup if vars are missing
│   │   └── constants.ts       # Domain constants (hold duration, token expiry, pricing multipliers)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.router.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts    # register, login, refresh, logout logic
│   │   │   ├── auth.schema.ts     # Zod schemas for request bodies
│   │   │   └── auth.types.ts
│   │   ├── users/
│   │   │   ├── users.router.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.schema.ts
│   │   │   └── users.types.ts
│   │   ├── movies/
│   │   │   ├── movies.router.ts
│   │   │   ├── movies.controller.ts
│   │   │   ├── movies.service.ts  # filtering, pagination, soft delete
│   │   │   ├── movies.schema.ts
│   │   │   └── movies.types.ts
│   │   ├── screens/
│   │   │   ├── screens.router.ts
│   │   │   ├── screens.controller.ts
│   │   │   ├── screens.service.ts # seat auto-generation on creation
│   │   │   ├── screens.schema.ts
│   │   │   └── screens.types.ts
│   │   ├── showtimes/
│   │   │   ├── showtimes.router.ts
│   │   │   ├── showtimes.controller.ts
│   │   │   ├── showtimes.service.ts # SeatInventory auto-creation on showtime creation
│   │   │   ├── showtimes.schema.ts
│   │   │   └── showtimes.types.ts
│   │   ├── bookings/
│   │   │   ├── bookings.router.ts
│   │   │   ├── bookings.controller.ts
│   │   │   ├── bookings.service.ts  # reserve, confirm, cancel — all transactional + locked
│   │   │   ├── bookings.schema.ts
│   │   │   └── bookings.types.ts
│   │   └── payments/
│   │       ├── payments.service.ts  # mock payment record creation
│   │       └── payments.types.ts
│   ├── middleware/
│   │   ├── authenticate.ts    # Verifies JWT, attaches req.user
│   │   ├── authorize.ts       # RBAC: authorize('admin') | authorize('customer')
│   │   ├── rateLimiter.ts     # Three rate-limit configs (auth / booking / general)
│   │   ├── validate.ts        # Zod middleware factory: validate(schema)
│   │   └── errorHandler.ts    # Centralized error handler — the only place that writes error responses
│   ├── jobs/
│   │   └── holdExpiry.job.ts  # node-cron: runs every minute, expires stale holds
│   ├── utils/
│   │   ├── AppError.ts        # Custom error class with statusCode + errorCode
│   │   ├── asyncHandler.ts    # Wraps async route handlers, forwards errors to next()
│   │   ├── pricing.ts         # Seat type × base price multiplier
│   │   └── generateReference.ts # Mock booking reference generator
│   ├── app.ts                 # Express app setup, middleware stack, route mounting
│   └── server.ts              # HTTP server bootstrap, cron job start
├── tests/
│   ├── unit/
│   │   ├── booking.service.test.ts  # reserve / confirm / cancel / expiry logic
│   │   ├── rbac.middleware.test.ts  # role enforcement
│   │   └── pricing.test.ts          # seat type × base price calculations
│   └── integration/
│       ├── auth.test.ts             # register → login → refresh → logout
│       ├── booking.lifecycle.test.ts # browse → select → reserve → confirm → cancel
│       ├── rate-limit.test.ts       # 429 behaviour per route group
│       └── concurrency.test.ts      # THE MANDATORY TEST — 10 simultaneous requests, 1 succeeds
├── .env.example
├── jest.config.ts
├── tsconfig.json
└── README.md
```

### Why this structure?

The module-per-domain approach (over a flat controllers/ + services/ split) co-locates all code related to a feature. When the bookings feature changes, you touch `src/modules/bookings/` — not files spread across six directories. Each module is independently testable because it has no hidden imports from sibling modules (only from shared `utils/` and `middleware/`).

---

## Database Design

### Entity-Relationship Overview

```
users ──< refresh_tokens
users ──< bookings
movies ──< showtimes
screens ──< seats
screens ──< showtimes
showtimes ──< seat_inventory
seats ──< seat_inventory
bookings ──< booked_seats
seat_inventory ──< booked_seats
bookings ──── payments (1:1)
```

### Schema

#### `users`
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
name          VARCHAR(255) NOT NULL
email         VARCHAR(255) NOT NULL UNIQUE
password_hash VARCHAR(255) NOT NULL
role          ENUM('admin', 'customer') NOT NULL DEFAULT 'customer'
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

#### `refresh_tokens`
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
token_hash VARCHAR(255) NOT NULL UNIQUE   -- stored as SHA-256 hash, never plaintext
expires_at TIMESTAMPTZ NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX: (user_id)
INDEX: (token_hash)
```
> Storing the token hash (not the raw token) means a database breach does not expose active refresh tokens. On verify: hash the incoming token, look it up.

#### `movies`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
title            VARCHAR(255) NOT NULL
description      TEXT
genre            VARCHAR(100) NOT NULL
language         VARCHAR(100) NOT NULL
duration_minutes INTEGER NOT NULL
rating           ENUM('U', 'UA', 'A') NOT NULL
release_date     DATE NOT NULL
poster_url       VARCHAR(500)
is_active        BOOLEAN NOT NULL DEFAULT TRUE
deleted_at       TIMESTAMPTZ            -- soft delete; NULL = not deleted
created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX: (genre)
INDEX: (language)
INDEX: (release_date)
INDEX: (deleted_at) WHERE deleted_at IS NULL  -- partial index for active-only queries
```

#### `screens`
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
name         VARCHAR(255) NOT NULL UNIQUE
total_seats  INTEGER NOT NULL
rows         INTEGER NOT NULL
seats_per_row INTEGER NOT NULL
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

#### `seats`
```sql
id        UUID PRIMARY KEY DEFAULT gen_random_uuid()
screen_id UUID NOT NULL REFERENCES screens(id)
row       VARCHAR(2) NOT NULL    -- 'A', 'B', ..., 'Z', 'AA', ...
number    INTEGER NOT NULL       -- 1, 2, 3, ...
label     VARCHAR(10) NOT NULL   -- 'A1', 'B15', etc.
type      ENUM('standard', 'premium', 'vip') NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE: (screen_id, row, number)
INDEX: (screen_id)
```

Seat generation logic (on screen creation):
- Rows are labelled A–Z (up to 26 rows; can extend to AA, AB... if needed)
- Each row maps to a seat type based on the `rowTypeMapping` provided at creation time (e.g., rows A–D = standard, E–H = premium, I–J = vip)
- Labels are `{row}{number}` — e.g., `A1`, `J15`

#### `showtimes`
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
movie_id   UUID NOT NULL REFERENCES movies(id)
screen_id  UUID NOT NULL REFERENCES screens(id)
starts_at  TIMESTAMPTZ NOT NULL
ends_at    TIMESTAMPTZ NOT NULL
base_price DECIMAL(10, 2) NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX: (movie_id)
INDEX: (screen_id)
INDEX: (starts_at)
```

#### `seat_inventory` ← source of truth for all seat state
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
showtime_id UUID NOT NULL REFERENCES showtimes(id)
seat_id     UUID NOT NULL REFERENCES seats(id)
status      ENUM('available', 'held', 'booked') NOT NULL DEFAULT 'available'
held_until  TIMESTAMPTZ          -- set when status = 'held'
booking_id  UUID REFERENCES bookings(id)  -- set when status = 'held' or 'booked'
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE: (showtime_id, seat_id)
INDEX: (showtime_id, status)     -- mandatory: queried on EVERY availability check
INDEX: (status, held_until)      -- for the hold-expiry cron job
```

> **Why a separate `seat_inventory` table instead of a status column on `seats`?**
> A `seat` belongs to a screen — it is a physical entity. Its availability is showtime-specific. The same seat A1 is "booked" for the 7pm show and "available" for the 10pm show simultaneously. `seat_inventory` is the join that carries per-showtime state.

#### `bookings`
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id           UUID NOT NULL REFERENCES users(id)
showtime_id       UUID NOT NULL REFERENCES showtimes(id)
status            ENUM('pending', 'confirmed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending'
total_amount      DECIMAL(10, 2) NOT NULL
booking_reference VARCHAR(20)          -- set on confirm (e.g., 'BK-A3F9K2')
expires_at        TIMESTAMPTZ NOT NULL  -- hold expiry timestamp (NOW + 10 min)
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX: (user_id, status)     -- mandatory: GET /bookings/my
INDEX: (showtime_id, status) -- admin listing by showtime
INDEX: (status, expires_at)  -- cron job: find pending + expired
```

#### `booked_seats`
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
seat_inventory_id UUID NOT NULL REFERENCES seat_inventory(id)
price             DECIMAL(10, 2) NOT NULL  -- price locked at booking time

UNIQUE: (booking_id, seat_inventory_id)  -- prevents duplicate seat in same booking
INDEX: (seat_inventory_id)
```

#### `payments`
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
booking_id     UUID NOT NULL UNIQUE REFERENCES bookings(id)
amount         DECIMAL(10, 2) NOT NULL
status         ENUM('pending', 'completed', 'refunded') NOT NULL DEFAULT 'completed'
payment_method VARCHAR(50) NOT NULL   -- 'card', 'upi', etc.
card_last_four VARCHAR(4)
transaction_id VARCHAR(100) NOT NULL  -- mock: generated UUID
created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Pricing Rules

```
standard  → base_price × 1.0
premium   → base_price × 1.5
vip       → base_price × 2.0
```

Price is calculated at reserve time and locked into `booked_seats.price`. If `base_price` changes later, existing bookings are unaffected.

---

## API Design

All routes are prefixed with `/api`. Swagger UI is served at `/api/docs`.

### Standard Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more selected seats are no longer available.",
    "details": []
  }
}
```

### Domain Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod schema violation |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `TOKEN_EXPIRED` | 401 | JWT or refresh token has expired |
| `TOKEN_INVALID` | 401 | JWT signature invalid or malformed |
| `FORBIDDEN` | 403 | Role insufficient for this endpoint |
| `NOT_FOUND` | 404 | Resource does not exist |
| `SHOWTIME_NOT_FOUND` | 404 | Showtime not found |
| `BOOKING_NOT_FOUND` | 404 | Booking not found |
| `SEAT_UNAVAILABLE` | 409 | One or more seats not in `available` state |
| `HOLD_CONFLICT` | 409 | Seat locked by concurrent request (SKIP LOCKED result) |
| `BOOKING_EXPIRED` | 409 | Hold window has passed |
| `BOOKING_ALREADY_CONFIRMED` | 409 | Attempt to confirm an already-confirmed booking |
| `SCREEN_OVERLAP` | 409 | Showtime overlaps with existing showtime on same screen |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

### Auth Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/auth/register` | No | — | Register new user (default role: customer) |
| POST | `/api/auth/login` | No | — | Login; returns access token + refresh token |
| POST | `/api/auth/refresh` | No | — | Issue new access token from refresh token |
| POST | `/api/auth/logout` | Yes | any | Invalidate refresh token |

**POST /api/auth/register**
```json
// Request
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }

// Response 201
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@example.com", "role": "customer" }
  }
}
```

**POST /api/auth/login**
```json
// Request
{ "email": "jane@example.com", "password": "secret123" }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 900
  }
}
```

**POST /api/auth/refresh**
```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "success": true, "data": { "accessToken": "eyJ...", "expiresIn": 900 } }
```

---

### Movie Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/movies` | Yes | admin | Create movie |
| GET | `/api/movies` | No | public | List movies (filter/search/sort/paginate) |
| GET | `/api/movies/:id` | No | public | Get movie details |
| PATCH | `/api/movies/:id` | Yes | admin | Update movie fields |
| DELETE | `/api/movies/:id` | Yes | admin | Soft delete (sets `deletedAt`) |

**GET /api/movies query params:**
```
?genre=Action
&language=English
&rating=UA
&search=inception         # case-insensitive title search (ILIKE)
&sortBy=releaseDate|title
&sortOrder=asc|desc
&page=1                   # offset = (page-1) * limit
&limit=20
```

**POST /api/movies** (admin)
```json
{
  "title": "Inception",
  "description": "A thief who steals corporate secrets...",
  "genre": "Sci-Fi",
  "language": "English",
  "durationMinutes": 148,
  "rating": "UA",
  "releaseDate": "2010-07-16",
  "posterUrl": "https://example.com/inception.jpg",
  "isActive": true
}
```

---

### Screen Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/screens` | Yes | admin | Create screen + auto-generate seats |
| GET | `/api/screens` | Yes | admin | List all screens |
| GET | `/api/screens/:id` | Yes | admin | Screen details with full seat map |

**POST /api/screens** (admin)
```json
{
  "name": "Screen 1",
  "rows": 10,
  "seatsPerRow": 15,
  "rowTypeMapping": {
    "standard": ["A", "B", "C", "D", "E"],
    "premium":  ["F", "G", "H"],
    "vip":      ["I", "J"]
  }
}
```

This atomically creates the `screen` record and 150 `seat` records (A1–J15) in a single transaction. `totalSeats` is computed from `rows × seatsPerRow`.

---

### Showtime Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/showtimes` | Yes | admin | Create showtime + auto-populate seat inventory |
| GET | `/api/showtimes` | Yes | any | List showtimes (filter by movieId, date, screenId) |
| GET | `/api/showtimes/:id` | Yes | any | Get showtime details |
| GET | `/api/showtimes/:id/seats` | Yes | any | Full seat map with per-seat status |

**POST /api/showtimes** (admin)
```json
{
  "movieId": "uuid",
  "screenId": "uuid",
  "startsAt": "2025-07-20T19:00:00Z",
  "endsAt": "2025-07-20T21:28:00Z",
  "basePrice": 200.00
}
```
On creation: validates no overlapping showtime on the same screen, then bulk-creates `seat_inventory` rows (one per seat in the screen) — all with `status = 'available'`.

**GET /api/showtimes/:id/seats** (authenticated)
```json
{
  "success": true,
  "data": {
    "showtimeId": "uuid",
    "seats": [
      {
        "seatInventoryId": "uuid",
        "seatId": "uuid",
        "label": "A1",
        "row": "A",
        "number": 1,
        "type": "standard",
        "price": 200.00,
        "status": "available",
        "heldUntil": null
      },
      {
        "seatInventoryId": "uuid",
        "label": "A2",
        "type": "standard",
        "price": 200.00,
        "status": "held",
        "heldUntil": "2025-07-20T19:10:00Z"
      }
    ]
  }
}
```

---

### Booking Endpoints

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/bookings/reserve` | Yes | customer | Step 1: Hold seats (10 min) |
| POST | `/api/bookings/:id/confirm` | Yes | customer | Step 2: Confirm + mock payment |
| DELETE | `/api/bookings/:id` | Yes | customer/admin | Cancel booking |
| GET | `/api/bookings/my` | Yes | customer | Own bookings (paginated) |
| GET | `/api/bookings/:id` | Yes | customer/admin | Single booking details |
| GET | `/api/bookings` | Yes | admin | All bookings (filterable) |

**POST /api/bookings/reserve** (customer)
```json
// Request
{
  "showtimeId": "uuid",
  "seatIds": ["uuid", "uuid"]
}

// Response 201
{
  "success": true,
  "data": {
    "bookingId": "uuid",
    "status": "pending",
    "expiresAt": "2025-07-20T19:10:00Z",
    "seats": [
      { "label": "A1", "type": "standard", "price": 200.00 },
      { "label": "A2", "type": "standard", "price": 200.00 }
    ],
    "totalAmount": 400.00
  }
}
```

**POST /api/bookings/:id/confirm** (customer)
```json
// Request
{ "paymentMethod": "card", "cardLastFour": "4242" }

// Response 200
{
  "success": true,
  "data": {
    "bookingId": "uuid",
    "bookingReference": "BK-A3F9K2",
    "status": "confirmed",
    "payment": {
      "transactionId": "TXN-uuid",
      "amount": 400.00,
      "status": "completed"
    }
  }
}
```

**DELETE /api/bookings/:id** (customer cancels own, admin cancels any)
- If `confirmed`: seats → `available`, payment → `refunded`
- If `pending`: seats → `available`
- Both run inside a transaction.

**GET /api/bookings** (admin)
```
?showtimeId=uuid
&status=confirmed|pending|cancelled|expired
&fromDate=2025-07-01
&toDate=2025-07-31
&page=1&limit=20
```

---

## Authentication & Authorization

### JWT Strategy

- **Access token**: signed with `JWT_SECRET`, 15-minute expiry, contains `{ sub: userId, role, iat, exp }`
- **Refresh token**: signed with `JWT_REFRESH_SECRET`, 7-day expiry, stored as SHA-256 hash in `refresh_tokens` table
- On logout: the refresh token hash is deleted from the DB — the access token becomes effectively invalid after 15 minutes (acceptable trade-off; short enough that a separate blocklist is unnecessary)

### Middleware Stack (per-request order)

```
Request
  → rateLimiter (route-specific)
  → authenticate (verifies JWT, attaches req.user)
  → authorize('admin' | 'customer') (checks req.user.role)
  → validate(zodSchema) (parses + coerces body/query/params)
  → controller → service
  → asyncHandler catches any thrown AppError
  → errorHandler writes the response
```

### RBAC Implementation

`authorize` is a middleware factory:
```typescript
// Usage in router:
router.post('/movies', authenticate, authorize('admin'), validate(createMovieSchema), moviesController.create);
```

`authorize` reads `req.user.role` (set by `authenticate`) and calls `next(new AppError(403, 'FORBIDDEN', '...'))` if the role does not match. Role checks are never in services or controllers.

---

## Concurrency Strategy

### The Problem

A naive reserve implementation:
1. `SELECT * FROM seat_inventory WHERE id = $1 AND status = 'available'` — both concurrent requests read "available"
2. Both pass the availability check in application code
3. Both execute `UPDATE seat_inventory SET status = 'held' WHERE id = $1`
4. Both create a `Booking` record → **double booking**

This is a classic TOCTOU (Time-of-check Time-of-use) race condition. It cannot be fixed with application-level locks because Node.js is single-threaded per process, but multiple processes (horizontal scaling) would each have their own lock state.

### Chosen Approach: `SELECT ... FOR UPDATE SKIP LOCKED`

Inside a Prisma `$transaction` with `SERIALIZABLE` isolation:

```sql
BEGIN;

-- Attempt to lock the requested seat_inventory rows.
-- SKIP LOCKED means: if a row is already locked by another transaction,
-- do not wait — skip it and return only the rows we could lock immediately.
SELECT id, status FROM seat_inventory
WHERE id = ANY($seatInventoryIds)
  AND status = 'available'
FOR UPDATE SKIP LOCKED;

-- If the count of locked rows < requested count:
-- → some seats were already locked (being booked concurrently) or unavailable
-- → raise HOLD_CONFLICT (409) and ROLLBACK

-- Otherwise: update status, create Booking + BookedSeats records
UPDATE seat_inventory SET status = 'held', held_until = NOW() + INTERVAL '10 minutes'
WHERE id = ANY($lockedIds);

INSERT INTO bookings (...) VALUES (...);
INSERT INTO booked_seats (...) VALUES (...);

COMMIT;
```

### Why SKIP LOCKED over the alternatives?

| Approach | Verdict | Reason |
|---|---|---|
| `FOR UPDATE` (blocking) | Acceptable | Concurrent requests queue up behind the lock. When the first commits, the queued requests re-check and find the seat unavailable — they then fail. Correct, but causes lock queues under high concurrency. |
| `FOR UPDATE SKIP LOCKED` | **Chosen** | Concurrent requests that cannot immediately acquire the lock skip those rows and fail fast with 409. No queue, no waiting. Exact semantics for "this seat is being booked right now — try another." |
| Optimistic locking (version field) | Acceptable | Requires a retry loop in application code. Adds application complexity and can still collide under extreme concurrency without backoff. |
| Advisory locks | Overkill | Useful when locking non-row resources. For row-level locking on specific seat IDs, `FOR UPDATE` is more idiomatic. |
| Application-level mutex | **Rejected** | Fails under horizontal scaling. Each process has its own in-memory state. This is not a real solution. |

**SKIP LOCKED is chosen because:**
1. It matches the exact semantics of seat selection: if you're booking seat A1 and someone else is mid-transaction on it, you should fail immediately, not wait 200ms only to then fail anyway
2. It eliminates lock queuing — under a spike of 100 simultaneous requests for the same seat, only 1 acquires the lock; the other 99 fail instantly
3. The failure response (409 `HOLD_CONFLICT`) gives the client meaningful information to present alternative seats

### What the failure mode looks like without locking

Without `FOR UPDATE SKIP LOCKED`:
- T=0ms: Request A reads seat A1 as `available`
- T=0ms: Request B reads seat A1 as `available`
- T=5ms: Request A sets seat A1 to `held`, creates Booking-1
- T=5ms: Request B sets seat A1 to `held`, creates Booking-2 ← **double booking**
- Both users have confirmation. At confirm time, one payment will fail or both seats end up `booked` — the system is in an inconsistent state.

### Trade-offs of SKIP LOCKED

- **Lock contention on popular showtimes**: Under extreme load on a single seat, the lock contention is negligible because SKIP LOCKED never blocks — it either locks immediately or fails instantly.
- **User experience**: The customer gets a 409 immediately and must re-select. This is the standard behaviour on real ticketing platforms (BookMyShow, Ticketmaster).
- **Throughput**: Higher than `FOR UPDATE` because no transactions wait in queue. The database connection pool is not held while waiting for locks.
- **Not suitable for "best available seat" allocation**: SKIP LOCKED works for user-selected seats. If the system were to automatically assign seats, the SKIP LOCKED approach would need careful retry logic.

### Concurrency Test (Mandatory)

Located at `tests/integration/concurrency.test.ts`:

1. Creates a screen with 3 seats
2. Creates a showtime
3. Fires 10 simultaneous `POST /api/bookings/reserve` requests via `Promise.all`, all targeting the same single seat
4. Asserts exactly 1 response has HTTP 201 (success)
5. Asserts exactly 9 responses have HTTP 409 with code `HOLD_CONFLICT` or `SEAT_UNAVAILABLE`
6. Queries the database directly and asserts the seat has exactly one `held` or `booked` row — not two

This test is deterministic because `FOR UPDATE SKIP LOCKED` is a database-level guarantee, not a timing-dependent heuristic.

---

## Rate Limiting

Implemented with `express-rate-limit` (in-memory store). Three distinct limiters applied as route-level middleware:

| Limiter | Routes | Limit | Window | Error |
|---|---|---|---|---|
| `authLimiter` | `/api/auth/*` | 10 requests | 15 minutes / IP | 429 + `Retry-After` header |
| `bookingLimiter` | `/api/bookings/*` | 20 requests | 1 minute / user ID | 429 + `Retry-After` header |
| `generalLimiter` | All other routes | 100 requests | 1 minute / user ID | 429 + `Retry-After` header |

The booking and general limiters key on authenticated user ID (from `req.user.id`) rather than IP to prevent users from bypassing limits via VPN/proxies once authenticated.

---

## Background Jobs

### Hold Expiry Job (`src/jobs/holdExpiry.job.ts`)

Runs every minute via `node-cron`. This is a proper background process started in `server.ts` — it is never triggered by a user request.

```
Cron schedule: * * * * *  (every minute)

Algorithm:
1. BEGIN TRANSACTION
2. SELECT id, booking_id FROM seat_inventory
   WHERE status = 'held' AND held_until < NOW()
   FOR UPDATE SKIP LOCKED   ← avoid conflicting with active booking transactions
3. If none found: COMMIT and return
4. UPDATE seat_inventory SET status = 'available', held_until = NULL, booking_id = NULL
   WHERE id = ANY(expiredSeatInventoryIds)
5. UPDATE bookings SET status = 'expired'
   WHERE id = ANY(expiredBookingIds) AND status = 'pending'
6. COMMIT
```

The job uses `SKIP LOCKED` on the seat rows so it does not block active booking transactions and vice versa. If the job is mid-run when a user attempts to confirm a booking on an expired hold, the confirm endpoint checks `booking.status` and `booking.expiresAt` — it will receive `BOOKING_EXPIRED`.

---

## Error Handling & Validation

### AppError

```typescript
class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown[] = []
  ) { ... }
}
```

Services throw `AppError`. Controllers never catch — they use `asyncHandler` which passes errors to `next()`. The single `errorHandler` middleware at the bottom of the Express stack formats and sends all error responses.

### Validation

`validate(schema)` is a middleware factory that runs `schema.safeParse(req.body | req.query | req.params)`. On failure, it throws `AppError(400, 'VALIDATION_ERROR', ...)` with Zod's formatted errors in `details`. On success, it attaches the parsed (coerced, type-safe) data back to `req.body` / `req.query`.

---

## Testing Strategy

### Unit Tests (`tests/unit/`)

- **`booking.service.test.ts`**: Tests reserve, confirm, cancel, and expiry logic in isolation with a mocked Prisma client. No real database.
- **`rbac.middleware.test.ts`**: Tests that `authorize('admin')` calls `next(error)` for customer tokens and `next()` for admin tokens.
- **`pricing.test.ts`**: Tests the `calculatePrice(basePrice, seatType)` utility for all three seat types and edge cases.

### Integration Tests (`tests/integration/`)

Run against a real test database (separate `DATABASE_URL_TEST` env var). Each test file uses `beforeAll` / `afterAll` to migrate up and seed, then `afterEach` to truncate data.

- **`auth.test.ts`**: Full register → login → refresh → logout flow. Also tests duplicate email, wrong password, expired refresh token.
- **`booking.lifecycle.test.ts`**: Full browse → select seats → reserve → confirm → cancel cycle. Tests hold expiry validation, cancellation state machine.
- **`rate-limit.test.ts`**: Fires N+1 requests to auth and booking routes, asserts 429 on the N+1th.
- **`concurrency.test.ts`**: The mandatory concurrency test (see Concurrency Strategy section above).

### Coverage Target

`>70%` on business logic (`src/modules/`, `src/utils/`). Coverage report generated with `jest --coverage`.

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm 10+

### 1. Clone and Install

```bash
git clone <repo-url>
cd movie-ticketing
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### 3. Run Database Migrations

```bash
npx prisma migrate deploy
```

### 4. (Optional) Seed an Admin User

```bash
npm run seed
```

### 5. Start Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`. Swagger UI: `http://localhost:3000/api/docs`.

### 6. Build for Production

```bash
npm run build
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/movie_ticketing
DATABASE_URL_TEST=postgresql://user:password@localhost:5432/movie_ticketing_test

# JWT — generate strong random secrets (openssl rand -base64 64)
JWT_SECRET=your-access-token-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-token-secret-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Bcrypt
BCRYPT_ROUNDS=12

# Booking
HOLD_DURATION_MINUTES=10

# Rate Limiting
RATE_LIMIT_AUTH_WINDOW_MS=900000     # 15 minutes
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_BOOKING_WINDOW_MS=60000   # 1 minute
RATE_LIMIT_BOOKING_MAX=20
RATE_LIMIT_GENERAL_WINDOW_MS=60000
RATE_LIMIT_GENERAL_MAX=100
```

---

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage

# Run only the concurrency test
npm test -- --testPathPattern=concurrency

# Run only unit tests
npm test -- --testPathPattern=unit

# Run only integration tests
npm test -- --testPathPattern=integration
```

> **Note:** Integration and concurrency tests require `DATABASE_URL_TEST` to point to a running PostgreSQL instance. The test setup runs `prisma migrate deploy` against the test database automatically.

---

## Known Limitations & Future Improvements

### Current Limitations

1. **In-memory rate limiting**: `express-rate-limit` with the default in-memory store resets on server restart and does not work correctly across multiple Node.js processes. In production, this should use a Redis store (`rate-limit-redis`).

2. **No refresh token rotation**: Currently a refresh token is valid until it expires or is explicitly logged out. Rotating refresh tokens on every use (issue a new one, invalidate the old) would limit the window of exposure if a token is stolen.

3. **Mock payment only**: The payment service creates a `Payment` record with a generated transaction ID but does not integrate any real payment gateway. A real implementation would use Stripe or Razorpay with webhook-based confirmation.

4. **Single-process cron job**: The hold-expiry job runs inside the Node.js process. Under horizontal scaling (multiple instances), multiple instances would run the same cron job simultaneously. The `FOR UPDATE SKIP LOCKED` in the job prevents double-processing, but ideally this would be extracted to a dedicated worker or a distributed scheduler.

5. **No email notifications**: A real ticketing system would send confirmation emails on booking, cancellation, and expiry.

6. **Seat layout is immutable post-creation**: Screens cannot be updated after creation because changing the seat layout would invalidate existing `seat_inventory` rows. A real system would need a careful migration path.

7. **No showtime overlap detection for movies**: Two different movies can be scheduled at overlapping times on different screens. The current overlap check is scoped to `(screen_id, time_range)` only.

### What I Would Do Differently With More Time

- **Redis for rate limiting and session caching**: Removes the in-process state problem for horizontal scaling.
- **Queue-based payment processing**: Replace synchronous mock payment with a BullMQ job queue so the confirm endpoint returns immediately and payment processing happens asynchronously.
- **Event sourcing for booking state**: Log every state transition (available → held → booked → cancelled) to an audit table for debugging and customer support.
- **Refresh token rotation with family tracking**: Implement token families to detect refresh token reuse attacks (a stolen token reused after rotation invalidates the entire family).
- **Distributed cron via pg_cron**: Move the hold-expiry job into a PostgreSQL extension (`pg_cron`) so it runs exactly once regardless of how many app instances are running.
