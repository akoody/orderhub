# RFC-0001: Idempotency for payments

## Problem
Payment creation and provider webhooks can be retried. Without idempotency, retries can create duplicate payments or apply state transitions more than once.

## Options
- Redis lock with TTL (risk: lock expiry and split-brain on retries).
- DB unique constraint on idempotency key for payment creation.
- Idempotent webhook handling (dedupe by payment state / provider event id).

## Decision
Use a unique constraint on `Payment.idempotencyKey` for create. On conflict, read the existing payment and return it. Webhook handler is idempotent and only transitions `PENDING -> SUCCESS/FAILED` once. If a webhook arrives multiple times, no duplicate state changes are applied.

## Risks
- Key reuse by clients (should be UUID, one-time).
- Race conditions around unique constraint handling (handled by retrying read).
- Clock skew for TTL-based alternatives.
