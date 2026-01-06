import { prisma, connectPrisma } from "../shared/db/prisma";
import { connectRabbit, publishJson, NOTIFICATIONS_QUEUE } from "../shared/queue/rabbit";
import { queueProcessedTotal } from "../shared/metrics/metrics";

const intervalMs = Number(process.env.OUTBOX_INTERVAL_MS ?? 5000);

export function startOutboxPublisher() {
  let running = false;

  const timer = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const events = await prisma.outboxEvent.findMany({
        where: { status: "NEW" },
        orderBy: { createdAt: "asc" },
        take: 100
      });

      for (const event of events) {
        try {
          await publishJson(NOTIFICATIONS_QUEUE, event.payload);
          queueProcessedTotal.inc({ queue: NOTIFICATIONS_QUEUE });
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: "SENT", sentAt: new Date() }
          });
        } catch (err) {
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: "ERROR" }
          });
        }
      }
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
