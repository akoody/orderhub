import "dotenv/config";
import { buildServer } from "./app/server";
import { connectPrisma, disconnectPrisma } from "./shared/db/prisma";
import { connectRedis, disconnectRedis } from "./shared/redis/redis";
import { connectRabbit, closeRabbit } from "./shared/queue/rabbit";

const app = buildServer();
const port = Number(process.env.PORT ?? 3000);

async function start() {
  await connectPrisma();
  app.log.info("prisma connected");

  await connectRedis();
  app.log.info("redis connected");

  await connectRabbit();
  app.log.info("rabbit connected");

  await app.listen({ port, host: "0.0.0.0" });
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await disconnectRedis();
  await closeRabbit();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((err) => {
  app.log.error(err, "server failed to start");
  process.exit(1);
});
