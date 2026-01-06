# DB Deep Dive

## Goal
Create a slow query on purpose, capture EXPLAIN ANALYZE, add an index, and compare plans.

## Slow query (no index)
Filter by `status` and sort by `createdAt` without a compound index.

```sql
EXPLAIN ANALYZE
SELECT id, user_id, status, total, created_at
FROM "Order"
WHERE status = 'PENDING'
ORDER BY created_at DESC
LIMIT 50;
```

Record the plan and timing here:
- Plan:
- Time:

## Add index

```sql
CREATE INDEX "Order_status_createdAt_idx"
ON "Order" (status, created_at DESC);
```

## Re-run EXPLAIN ANALYZE

```sql
EXPLAIN ANALYZE
SELECT id, user_id, status, total, created_at
FROM "Order"
WHERE status = 'PENDING'
ORDER BY created_at DESC
LIMIT 50;
```

Record the plan and timing here:
- Plan:
- Time:

## Interpretation
- What changed in the plan:
- Why it is faster:
