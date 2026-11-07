import amqp, {
  type Channel,
  type ChannelModel,
  type ConsumeMessage
} from "amqplib";

export const NOTIFICATIONS_QUEUE = "notifications";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectRabbit(): Promise<Channel> {
  if (!connection || !channel) {
    const url = process.env.RABBIT_URL ?? "amqp://localhost:5672";
    const conn = await amqp.connect(url);
    const ch = await conn.createChannel();
    await ch.assertQueue(NOTIFICATIONS_QUEUE, { durable: true });
    connection = conn;
    channel = ch;
  }

  return channel;
}

export async function publishJson(queue: string, payload: unknown) {
  const ch = await connectRabbit();
  const body = Buffer.from(JSON.stringify(payload));
  return ch.sendToQueue(queue, body, { persistent: true });
}

export async function consumeJson(
  queue: string,
  handler: (payload: unknown) => Promise<void>
) {
  const ch = await connectRabbit();
  await ch.consume(queue, async (msg: ConsumeMessage | null) => {
    if (!msg) {
      return;
    }

    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload);
      ch.ack(msg);
    } catch (err) {
      ch.nack(msg, false, false);
    }
  });
}

export async function closeRabbit() {
  if (channel) {
    await channel.close();
    channel = null;
  }
  if (connection) {
    await connection.close();
    connection = null;
  }
}
