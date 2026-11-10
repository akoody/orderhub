# RFC-0001: Idempotency for payments

## Problem
Payment creation and provider webhooks can be retried. Without idempotency, retries can create duplicate payments or apply state transitions more than once.

## Options
- Redis lock with TTL (risk: lock expiry and split-brain on retries).
- DB unique constraint on idempotency key for payment creation.
- Idempotent webhook handling (dedupe by payment state / provider event id).

## Decision
Use a unique constraint on `Payment.idempotencyKey` for create. Before creating, and again on a unique-constraint conflict, look the key up:
- same key, same order, same user: return the existing payment (a retry);
- same key used for a different order or by a different user: reject with `422`, never return the stored payment.

Webhook handler is idempotent and only transitions `PENDING -> SUCCESS/FAILED` once. If a webhook arrives multiple times, no duplicate state changes are applied. Webhooks must carry `X-Webhook-Signature: sha256=<HMAC of the raw body>` with `PAYMENT_WEBHOOK_SECRET`; unsigned or forged requests get `401` before any state is read.

## Risks
- Key reuse by clients (should be UUID, one-time): detected and rejected with `422` instead of returning the original payment.
- Race conditions around unique constraint handling (handled by retrying read).
- Clock skew for TTL-based alternatives.
