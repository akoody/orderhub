import { prisma, connectPrisma } from "../shared/db/prisma";
import {
  connectRabbit,
  publishJson,
  NOTIFICATIONS_QUEUE
} from "../shared/queue/rabbit";
import { queueProcessedTotal } from "../shared/metrics/metrics";
import { processOutboxBatch } from "../modules/outbox/usecases/processOutboxBatch";

const intervalMs = Number(process.env.OUTBOX_INTERVAL_MS ?? 5000);

export function startOutboxPublisher() {
  let running = false;

  const timer = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await processOutboxBatch(prisma, async (message) => {
        // messageId = id события: по нему получатель отбрасывает повторы.
        await publishJson(NOTIFICATIONS_QUEUE, message.payload, {
          messageId: message.id,
          type: message.type
        });
        queueProcessedTotal.inc({ queue: NOTIFICATIONS_QUEUE });
      });
      if (result.retried || result.failed) {
        console.warn("outbox batch had failures", result);
      }
    } catch (err) {
      console.error("outbox batch failed", err);
    } finally {
      running = false;
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

async function start() {
  await connectPrisma();
  await connectRabbit();
  startOutboxPublisher();
  console.log("outbox publisher started");
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
