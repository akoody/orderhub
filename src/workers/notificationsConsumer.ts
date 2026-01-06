import { connectRabbit, consumeJson, NOTIFICATIONS_QUEUE } from "../shared/queue/rabbit";
import { queueProcessedTotal } from "../shared/metrics/metrics";

export async function startNotificationsConsumer() {
  await connectRabbit();
  await consumeJson(NOTIFICATIONS_QUEUE, async (payload) => {
    console.log("sent notification", payload);
    queueProcessedTotal.inc({ queue: NOTIFICATIONS_QUEUE });
  });

  console.log("notifications consumer started");
}

if (require.main === module) {
  startNotificationsConsumer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
