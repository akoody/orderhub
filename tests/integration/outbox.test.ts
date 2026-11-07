import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import {
  type OutboxMessage,
  processOutboxBatch
} from "../../src/modules/outbox/usecases/processOutboxBatch";
import { cleanupDb, setupDb, teardownDb } from "../helpers/db";

const t0 = new Date("2026-01-01T12:00:00.000Z");
const at = (ms: number) => () => new Date(t0.getTime() + ms);

async function seedEvents(count: number) {
  for (let i = 0; i < count; i += 1) {
    await prisma.outboxEvent.create({
      data: {
        type: "PaymentSucceeded",
        payload: { n: i },
        createdAt: new Date(t0.getTime() - 60_000 + i),
        nextAttemptAt: new Date(t0.getTime() - 1000)
      }
    });
  }
}

describe("outbox delivery", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(cleanupDb);

  it("publishes pending events in order and marks them sent", async () => {
    await seedEvents(3);
    const published: OutboxMessage[] = [];

    const result = await processOutboxBatch(
      prisma,
      async (m) => {
        published.push(m);
      },
      { now: at(0) }
    );

    expect(result).toEqual({ sent: 3, retried: 0, failed: 0 });
    expect(published.map((m) => m.payload)).toEqual([
      { n: 0 },
      { n: 1 },
      { n: 2 }
    ]);
    const statuses = await prisma.outboxEvent.findMany({
      select: { id: true, status: true }
    });
    expect(statuses.every((e) => e.status === "SENT")).toBe(true);
    expect(new Set(published.map((m) => m.id))).toEqual(
      new Set(statuses.map((e) => e.id))
    );
  });

  it("keeps a failed event and retries it after a backoff", async () => {
    await seedEvents(1);
    const failing = async () => {
      throw new Error("broker unavailable");
    };

    expect(await processOutboxBatch(prisma, failing, { now: at(0) })).toEqual({
      sent: 0,
      retried: 1,
      failed: 0
    });
    const event = await prisma.outboxEvent.findFirstOrThrow();
    expect(event).toMatchObject({
      status: "NEW",
      attempts: 1,
      lastError: "broker unavailable"
    });
    expect(event.nextAttemptAt.getTime()).toBe(t0.getTime() + 1000);

    // До истечения задержки событие не берётся.
    const early: OutboxMessage[] = [];
    await processOutboxBatch(prisma, async (m) => void early.push(m), {
      now: at(500)
    });
    expect(early).toHaveLength(0);

    const later = await processOutboxBatch(prisma, async () => {}, {
      now: at(1000)
    });
    expect(later.sent).toBe(1);
  });

  it("gives up after maxAttempts and marks the event as ERROR", async () => {
    await seedEvents(1);
    const failing = async () => {
      throw new Error("rejected");
    };

    for (let i = 0; i < 3; i += 1) {
      await processOutboxBatch(prisma, failing, {
        maxAttempts: 3,
        now: at(i * 60_000)
      });
    }

    const event = await prisma.outboxEvent.findFirstOrThrow();
    expect(event).toMatchObject({ status: "ERROR", attempts: 3 });
  });

  it("does not publish the same event twice from parallel publishers", async () => {
    await seedEvents(20);
    const published: string[] = [];
    const slowPublish = async (m: OutboxMessage) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      published.push(m.id);
    };

    const results = await Promise.all([
      processOutboxBatch(prisma, slowPublish, { batchSize: 15, now: at(0) }),
      processOutboxBatch(prisma, slowPublish, { batchSize: 15, now: at(0) }),
      processOutboxBatch(prisma, slowPublish, { batchSize: 15, now: at(0) })
    ]);

    expect(published).toHaveLength(20);
    expect(new Set(published).size).toBe(20);
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(20);
  });
});
