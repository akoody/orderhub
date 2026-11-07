import amqp, {
  type ConfirmChannel,
  type ChannelModel,
  type ConsumeMessage
} from "amqplib";

export const NOTIFICATIONS_QUEUE = "notifications";

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

/** Confirm-канал: публикация считается успешной только после ack брокера. */
export async function connectRabbit(): Promise<ConfirmChannel> {
  if (!connection || !channel) {
    const url = process.env.RABBIT_URL ?? "amqp://localhost:5672";
    const conn = await amqp.connect(url);
    const ch = await conn.createConfirmChannel();
    await ch.assertQueue(NOTIFICATIONS_QUEUE, { durable: true });
    connection = conn;
    channel = ch;
  }

  return channel;
}

export async function publishJson(
  queue: string,
  payload: unknown,
  options: { messageId?: string; type?: string } = {}
) {
  const ch = await connectRabbit();
  const body = Buffer.from(JSON.stringify(payload));
  await new Promise<void>((resolve, reject) => {
    ch.sendToQueue(
      queue,
      body,
      { persistent: true, contentType: "application/json", ...options },
      (err: unknown) => (err ? reject(err) : resolve())
    );
  });
}

export async function consumeJson(
  queue: string,
  handler: (payload: unknown, message: ConsumeMessage) => Promise<void>
) {
  const ch = await connectRabbit();
  await ch.consume(queue, async (msg: ConsumeMessage | null) => {
    if (!msg) {
      return;
    }

    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload, msg);
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
