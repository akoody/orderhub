# Runbook

## Queue is growing
- Check RabbitMQ queue depth and consumer status.
- Check outbox worker logs for publish errors.
- Verify DB connectivity and outbox lag (`/metrics` -> `outbox_lag`).
- Restart outbox worker if it is stuck.

## Webhook duplicates
- Confirm provider retries and expected retry windows.
- Verify webhook handler is idempotent and only transitions from PENDING.
- Check for repeated payment IDs or provider refs.

## P95 latency increased
- Check `/metrics` histogram and identify hot routes.
- Check DB slow queries and connection pool saturation.
- Review recent deploys and configuration changes.

## DB slow queries
- Run `EXPLAIN ANALYZE` for the slow query.
- Add missing indexes and re-test.
- Compare plan changes and timings.
