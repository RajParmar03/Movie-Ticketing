# Movie Ticketing System — Backend API

A production-grade RESTful API for a movie ticketing platform. Admins manage movies, screens, and showtimes; customers browse listings, select seats, reserve and confirm bookings. The system is built to handle concurrent booking attempts correctly at the database level.

**Stack:** Node.js 20 · TypeScript (strict) · Express · PostgreSQL · Prisma ORM · Jest + Supertest

---

## Table of Contents

- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Concurrency Strategy](#concurrency-strategy)
- [API Overview](#api-overview)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Known Limitations & Future Improvements](#known-limitations--future-improvements)
- [Submission Checklist](#submission-checklist)

---

## Setup Instructions

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+
- **npm** 10+

### 1. Clone & Install

```bash
git clone <repo-url>
cd movie-ticketing
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env — fill in DATABASE_URL, JWT secrets, and other required values
```

### 3. Create and Run Migrations

**First time (creates migration files + applies them):**
```bash
npx prisma migrate dev --name init
```

**Subsequent runs / CI / production (applies existing migrations only):**
```bash
npx prisma migrate deploy
npx prisma generate
```

> Do **not** use `prisma db push` in production — it bypasses migration history.

### 4. (Optional) Seed an Admin User

```bash
npm run seed
```

This creates one admin (`admin@example.com` / `Admin1234!`) and one customer account for testing.

### 5. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`.
Swagger UI: **`http://localhost:3000/api/docs`**

### 6. Build for Production

```bash
npm run build
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env`. All variables are required unless marked optional.

| Variable | Example value | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment. One of `development`, `test`, `production`. Controls logging verbosity and DB selection. |
| `PORT` | `3000` | Port the HTTP server listens on. |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/movie_ticketing` | PostgreSQL connection string for the main (development / production) database. |
| `DATABASE_URL_TEST` | `postgresql://user:pass@localhost:5432/movie_ticketing_test` | Separate PostgreSQL database used exclusively by the test suite. Must point to a **different** database from `DATABASE_URL` — tests truncate all tables between runs. |
| `JWT_SECRET` | *(64-byte hex string)* | Secret used to sign and verify short-lived **access tokens** (15-minute expiry). Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | *(64-byte hex string)* | Secret used to sign and verify long-lived **refresh tokens** (7-day expiry). Must be different from `JWT_SECRET`. |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime. Uses the [`ms`](https://github.com/vercel/ms) format (`15m`, `1h`, etc.). |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime. Uses the `ms` format (`7d`, `30d`, etc.). |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor for password hashing. Higher = slower hash but more resistant to brute-force. `12` is the recommended production value; use `4` in tests for speed. |
| `HOLD_DURATION_MINUTES` | `10` | How many minutes a seat hold lasts after `POST /bookings/reserve` before the background job automatically expires it and releases the seats. |

A complete `.env.example` file is included in the repository root.

---

## Concurrency Strategy

### The Problem

A naive booking implementation has a classic TOCTOU (Time-of-check / Time-of-use) race condition:

1. Request A reads seat A1 → `available`
2. Request B reads seat A1 → `available` *(same moment)*
3. Request A writes `held`
4. Request B writes `held` ← **double booking**

Both users now hold a confirmation for the same seat. Neither application-level mutexes nor version checks in JavaScript fix this — they break under horizontal scaling because each process has independent memory.

### Chosen Approach: `SELECT ... FOR UPDATE SKIP LOCKED`

Every seat reservation runs inside a Prisma `$transaction`. The critical section is a single raw SQL statement:

```sql
SELECT si.id, si.seat_id, si.price, s.label, s.type
FROM seat_inventory si
JOIN seats s ON s.id = si.seat_id
WHERE si.showtime_id = $1
  AND si.seat_id IN ($2, $3, ...)
  AND si.status = 'available'
FOR UPDATE SKIP LOCKED;
```

**What this does:**

- `FOR UPDATE` acquires a row-level exclusive lock on each matching row. No other transaction can lock, update, or delete those rows until this transaction commits or rolls back.
- `SKIP LOCKED` means: if a row is already locked by another transaction, skip it instead of waiting. The query returns only the rows it could lock immediately.

**The outcome for 10 simultaneous requests on the same seat:**

| Request | `FOR UPDATE SKIP LOCKED` result | Response |
|---|---|---|
| First to execute | Locks seat row, gets 1 row back | 201 Created |
| All 9 others | Row already locked → skipped → 0 rows returned | 409 Conflict |

This is deterministic and guaranteed by PostgreSQL. There is no timing window where two transactions can both lock the same row.

### Why SKIP LOCKED over the alternatives?

| Approach | Verdict | Reason |
|---|---|---|
| `FOR UPDATE` (blocking) | Acceptable | Concurrent requests queue behind the lock. They wait, then fail. Causes lock queues under load. |
| **`FOR UPDATE SKIP LOCKED`** | **Chosen** | Concurrent requests fail immediately. No waiting, no queue buildup. Correct semantics: "this seat is taken, pick another." |
| Optimistic locking (version field) | Acceptable | Requires application-level retry logic. More complex; can still collide at very high concurrency without backoff. |
| Advisory locks | Overkill | For non-row resources. Row-level `FOR UPDATE` is idiomatic for row state transitions. |
| In-memory JS locks/mutexes | **Rejected** | Breaks under horizontal scaling. Each process has independent state. Not a real solution. |

### Trade-offs

- **Latency on high-demand seats:** Failing fast means users see a 409 immediately and must re-select. This is the standard behaviour on real ticketing platforms (BookMyShow, Ticketmaster, Eventbrite).
- **Lock contention:** Under extreme concurrency, `SKIP LOCKED` avoids queue buildup entirely — losing transactions never block, they just fail.
- **Horizontal scaling:** This solution is correct across multiple Node.js instances because the lock lives in the database, not in application memory.
- **Not suitable for "best available" auto-assignment:** `SKIP LOCKED` works when users select specific seats. Auto-assignment of any available seat would need a retry loop on top of it.

---

## API Overview

Base URL: `/api` · Swagger UI: `/api/docs`

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register (default role: customer) |
| POST | `/auth/login` | No | Login → access token + refresh token |
| POST | `/auth/refresh` | No | Exchange refresh token for new access token |
| POST | `/auth/logout` | Yes | Invalidate refresh token |

### Movies

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/movies` | admin | Create movie |
| GET | `/movies` | public | List with filter/search/sort/pagination |
| GET | `/movies/:id` | public | Movie details |
| PATCH | `/movies/:id` | admin | Update movie |
| DELETE | `/movies/:id` | admin | Soft delete |

**GET /movies query params:** `genre`, `language`, `rating`, `search` (title), `sortBy` (`releaseDate`\|`title`), `sortOrder` (`asc`\|`desc`), `page`, `limit`

### Screens

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/screens` | admin | Create screen + auto-generate all seats |
| GET | `/screens` | admin | List screens |
| GET | `/screens/:id` | admin | Screen with full seat map |

### Showtimes

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/showtimes` | admin | Create showtime + auto-create seat inventory |
| GET | `/showtimes` | any | List (filter by `movieId`, `date`, `screenId`) |
| GET | `/showtimes/:id` | any | Showtime details |
| GET | `/showtimes/:id/seats` | any | Full seat map with per-seat status |

### Bookings

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/bookings/reserve` | customer | Step 1: Hold seats for 10 minutes |
| POST | `/bookings/:id/confirm` | customer | Step 2: Confirm booking + mock payment |
| DELETE | `/bookings/:id` | customer/admin | Cancel booking |
| GET | `/bookings/my` | customer | Own bookings (paginated) |
| GET | `/bookings/:id` | customer/admin | Booking details |
| GET | `/bookings` | admin | All bookings (filterable) |

### Pricing

- `standard` seat → `basePrice × 1.0`
- `premium` seat → `basePrice × 1.5`
- `vip` seat → `basePrice × 2.0`

Prices are locked into `booked_seats` at reservation time.

### Standard Response Shape

```json
// Success
{ "success": true, "data": { ... } }

// Error
{
  "success": false,
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "One or more selected seats are no longer available.",
    "details": []
  }
}
```

**Domain error codes:** `VALIDATION_ERROR` · `INVALID_CREDENTIALS` · `TOKEN_EXPIRED` · `TOKEN_INVALID` · `FORBIDDEN` · `NOT_FOUND` · `SHOWTIME_NOT_FOUND` · `SEAT_UNAVAILABLE` · `HOLD_CONFLICT` · `BOOKING_EXPIRED` · `BOOKING_NOT_FOUND` · `SCREEN_OVERLAP` · `RATE_LIMITED`

---

## Testing

### Prerequisites

The test suite requires a separate PostgreSQL database (`DATABASE_URL_TEST`). The setup script runs migrations automatically before any tests.

### Run Tests

```bash
# All tests (runs unit + integration + concurrency)
npm test

# With coverage report
npm run test:coverage

# Watch mode (development)
npm run test:watch

# Specific suites
npm test -- --testPathPattern=concurrency      # Just the concurrency test
npm test -- --testPathPattern=unit             # Unit tests only
npm test -- --testPathPattern=integration      # Integration tests only
```

### Test Coverage Target

`>70%` on business logic (`src/modules/`, `src/utils/`).

```bash
npm run test:coverage
# Coverage report written to coverage/lcov-report/index.html
```

### The Concurrency Test

Located at `tests/integration/concurrency.test.ts`. This test is mandatory and must pass reliably.

**What it does:**

1. Creates a screen with 3 seats and a showtime
2. Registers 10 test users
3. Fires **10 simultaneous** `POST /api/bookings/reserve` requests via `Promise.all`, all targeting the same single seat
4. Asserts **exactly 1** response is HTTP 201
5. Asserts **exactly 9** responses are HTTP 409 (`HOLD_CONFLICT` or `SEAT_UNAVAILABLE`)
6. Queries the database and asserts the seat has exactly one `held` record — no double-booking

```bash
npm test -- --testPathPattern=concurrency --verbose
```

### Test Structure

```
tests/
  helpers/
    testSetup.ts        # DB migration, seeding, cleanup helpers
  unit/
    pricing.test.ts               # Seat type × base price calculations
    rbac.middleware.test.ts        # Role enforcement
    booking.service.test.ts        # reserve / confirm / cancel / expiry logic
  integration/
    auth.test.ts                   # register → login → refresh → logout
    booking.lifecycle.test.ts      # Full booking flow end-to-end
    rate-limit.test.ts             # 429 behaviour per route group
    concurrency.test.ts            # THE mandatory concurrency test
```

---

## Project Structure

```
movie-ticketing/
├── prisma/
│   ├── schema.prisma          # All models, enums, indexes, and relations
│   ├── migrations/            # Versioned SQL migrations (never use db push in prod)
│   └── seed.ts                # Seeds one admin + one customer for local dev
├── src/
│   ├── config/
│   │   ├── env.ts             # Zod-validated env — process exits on startup if vars are missing
│   │   ├── constants.ts       # HOLD_DURATION_MS, seat price multipliers, row labels
│   │   └── database.ts        # Singleton PrismaClient (switches to DATABASE_URL_TEST in test env)
│   ├── modules/               # One folder per domain; each has router, controller, service, schema
│   │   ├── auth/              # register, login, refresh, logout
│   │   ├── movies/            # CRUD + soft delete + filter/sort/paginate
│   │   ├── screens/           # Create with auto seat generation
│   │   ├── showtimes/         # Create with auto seat_inventory population + seat map
│   │   ├── bookings/          # reserve (FOR UPDATE SKIP LOCKED), confirm, cancel, list
│   │   └── payments/          # Mock payment record creation
│   ├── middleware/
│   │   ├── authenticate.ts    # Verifies JWT, attaches req.user
│   │   ├── authorize.ts       # RBAC: authorize('admin') | authorize('customer')
│   │   ├── validate.ts        # Zod middleware factory
│   │   ├── rateLimiter.ts     # Three limiters: auth / booking / general
│   │   └── errorHandler.ts    # Centralized — the only place that writes error responses
│   ├── jobs/
│   │   └── holdExpiry.job.ts  # node-cron job: runs every minute, expires stale holds
│   ├── utils/
│   │   ├── AppError.ts        # Custom error class (statusCode + code + details)
│   │   ├── asyncHandler.ts    # Wraps async route handlers, forwards errors to next()
│   │   ├── pricing.ts         # calculatePrice(basePrice, seatType)
│   │   └── generateReference.ts # Booking reference generator (BK-XXXXXXXX)
│   ├── docs/
│   │   └── swagger.ts         # OpenAPI 3.0 spec — served at /api/docs
│   ├── app.ts                 # Express app: middleware stack + route mounting
│   └── server.ts              # HTTP server bootstrap + cron job start
└── tests/
    ├── helpers/
    │   └── testSetup.ts       # DB migration, user/screen/showtime factory helpers, cleanup
    ├── unit/
    │   ├── pricing.test.ts
    │   ├── rbac.middleware.test.ts
    │   └── booking.service.test.ts
    └── integration/
        ├── auth.test.ts
        ├── booking.lifecycle.test.ts
        ├── rate-limit.test.ts
        └── concurrency.test.ts   ← mandatory, must pass reliably
```

---

## Known Limitations & Future Improvements

### Current Limitations

1. **In-memory rate limiting** — `express-rate-limit` with the default store resets on server restart and does not share state across multiple Node.js instances. Production deployments should use `rate-limit-redis` with a shared Redis store.

2. **No refresh token rotation** — A refresh token is valid for its full 7-day window unless explicitly revoked. Rotating tokens on each use (invalidate old, issue new) would limit the exposure window if a token is leaked.

3. **Mock payment only** — The `Payment` record is created with a generated transaction ID. A real implementation would integrate Stripe or Razorpay with webhook-based payment confirmation.

4. **Single-process cron job** — The hold-expiry job runs inside the Node.js process. Under horizontal scaling, every instance would run the same job. The `FOR UPDATE SKIP LOCKED` in the job prevents double-processing, but a dedicated worker process or `pg_cron` would be cleaner.

5. **Immutable screen layout** — Seat layouts cannot be changed after screen creation. A real system would need a migration path that handles existing `seat_inventory` rows.

6. **No email notifications** — A production system would send confirmation, cancellation, and expiry emails via a transactional email provider (SendGrid, Postmark).

### Given More Time

- **Redis for rate limiting and refresh token caching** — Enables stateless horizontal scaling.
- **BullMQ job queue for payment processing** — Decouple payment from the HTTP request cycle; confirm endpoint returns immediately and payment runs async.
- **Refresh token families** — Detect stolen refresh tokens via reuse detection; invalidate the entire family on any reuse.
- **`pg_cron` for hold expiry** — Database-native scheduler runs exactly once regardless of app instance count.
- **Event audit log** — Record every seat state transition for customer support and debugging.

---

## Submission Checklist

- [x] `/api/docs` renders Swagger UI with all endpoints documented
- [x] `.env.example` is present and complete
- [x] All migrations run cleanly on a fresh database (`npx prisma migrate deploy`)
- [x] `npm test` runs and all tests pass, including the concurrency test
- [x] The concurrency test fires 10 simultaneous requests and confirms exactly 1 succeeds
- [x] No hardcoded secrets or debug `console.log` in production code
- [x] TypeScript compiles clean (`npx tsc --noEmit`)
- [x] README includes the **Concurrency Strategy** section
