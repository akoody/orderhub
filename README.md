# OrderHub

OrderHub is a small service for orders, payments, and notifications with idempotency and outbox delivery.

## Setup

```bash
pnpm install
docker compose up -d
pnpm dev
```

Environment:
- `DATABASE_URL` (see `.env`)
- `JWT_SECRET` (optional, default: `dev-secret`)

Workers:
```bash
pnpm worker:outbox
pnpm worker:notifications
```

## Endpoints

Auth:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

Orders:
- `POST /orders`
- `GET /orders/me`
- `PATCH /admin/orders/:id/status` (requires `x-admin: true` and `x-order-version`)

Payments:
- `POST /payments` (requires `Idempotency-Key` header)
- `POST /payments/webhook`
- `POST /provider/mock/pay`

Observability:
- `GET /health`
- `GET /ready`
- `GET /metrics`

## Examples

Register:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

Create order:
```bash
curl -X POST http://localhost:3000/orders \
  -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' \
  -d '{"items":[{"price":100,"quantity":2}]}'
```

Create payment (idempotent):
```bash
curl -X POST http://localhost:3000/payments \
  -H 'authorization: Bearer <token>' \
  -H 'Idempotency-Key: <uuid>' \
  -H 'content-type: application/json' \
  -d '{"orderId":"<orderId>"}'
```

Mock provider webhook:
```bash
curl -X POST http://localhost:3000/provider/mock/pay \
  -H 'content-type: application/json' \
  -d '{"paymentId":"<paymentId>"}'
```

## Architecture

See `docs/ARCHITECTURE.md`.

## Metrics

Prometheus metrics at `GET /metrics`:
- `http_request_duration_seconds`
- `http_requests_total`
- `queue_processed_total`
- `outbox_lag`

## Tests

```bash
pnpm test
pnpm test:unit
pnpm test:integration
```

## Senior stories

1) Idempotency + duplicate protection in payments.
2) Outbox pattern + guaranteed event delivery.
3) Performance fix with measured p95 improvement (see `docs/PERF.md`).
