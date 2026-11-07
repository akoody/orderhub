# Runbook

## Queue is growing
- Check RabbitMQ queue depth and consumer status.
- Check outbox worker logs for publish errors.
- Verify DB connectivity and outbox lag (`/metrics` -> `outbox_lag`).
- Inspect failing events: `SELECT id, type, attempts, "lastError", "nextAttemptAt" FROM "OutboxEvent" WHERE status <> 'SENT' ORDER BY "createdAt";`
- Events in `ERROR` exhausted their retries. After fixing the cause, requeue them:
  `UPDATE "OutboxEvent" SET status = 'NEW', attempts = 0, "nextAttemptAt" = now() WHERE status = 'ERROR';`
- Restart outbox worker if it is stuck; several publishers can run in parallel safely.

## Webhook duplicates
- Confirm provider retries and expected retry windows.
- Verify webhook handler is idempotent and only transitions from PENDING.
- `401 invalid signature` means the provider signs with a different `PAYMENT_WEBHOOK_SECRET` or a proxy modifies the body.
- Check for repeated payment IDs or provider refs.

## P95 latency increased
- Check `/metrics` histogram and identify hot routes.
- Check DB slow queries and connection pool saturation.
- Review recent deploys and configuration changes.

## DB slow queries
- Run `EXPLAIN ANALYZE` for the slow query.
- Add missing indexes and re-test.
- Compare plan changes and timings.
