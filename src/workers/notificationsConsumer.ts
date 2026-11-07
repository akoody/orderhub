import {
  connectRabbit,
  consumeJson,
  NOTIFICATIONS_QUEUE
} from "../shared/queue/rabbit";
import { queueProcessedTotal } from "../shared/metrics/metrics";

export async function startNotificationsConsumer() {
  await connectRabbit();
  // Доставка «хотя бы один раз»: реальный отправитель должен отбрасывать
  // повторы по message.properties.messageId (id события outbox).
  await consumeJson(NOTIFICATIONS_QUEUE, async (payload, message) => {
    console.log("sent notification", {
      eventId: message.properties.messageId,
      type: message.properties.type,
      payload
    });
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
