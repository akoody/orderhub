import Redis from "ioredis";

let client: Redis | null = null;

export function getRedisClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return client;
}

export async function connectRedis() {
  const redis = getRedisClient();
  await redis.ping();
  return redis;
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}
