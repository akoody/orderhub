import { OutboxStatus, Prisma, PrismaClient } from "@prisma/client";

export interface OutboxMessage {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
}

/** Публикует сообщение и резолвится только после подтверждения брокера. */
export type OutboxPublisher = (message: OutboxMessage) => Promise<void>;

export interface OutboxBatchOptions {
  batchSize?: number;
  maxAttempts?: number;
  /** Задержка перед повтором: 1с, 2с, 4с… но не больше maxBackoffMs. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  now?: () => Date;
}

export interface OutboxBatchResult {
  sent: number;
  retried: number;
  failed: number;
}

/**
 * Доставка outbox «хотя бы один раз».
 *
 * События захватываются через FOR UPDATE SKIP LOCKED, поэтому несколько
 * публикаторов не берут одно и то же событие. Событие помечается SENT только
 * после подтверждения брокера; при ошибке оно остаётся NEW и повторяется
 * с экспоненциальной задержкой, а после maxAttempts получает статус ERROR.
 * Повторная публикация после сбоя между подтверждением и UPDATE возможна,
 * поэтому получатели дедуплицируют сообщения по id.
 */
export async function processOutboxBatch(
  prisma: PrismaClient,
  publish: OutboxPublisher,
  {
    batchSize = 100,
    maxAttempts = 10,
    baseBackoffMs = 1000,
    maxBackoffMs = 5 * 60_000,
    now = () => new Date()
  }: OutboxBatchOptions = {}
): Promise<OutboxBatchResult> {
  return prisma.$transaction(
    async (tx) => {
      const events = await tx.$queryRaw<
        Array<OutboxMessage & { attempts: number }>
      >`
        SELECT "id", "type", "payload", "attempts"
        FROM "OutboxEvent"
        WHERE "status" = 'NEW'
          -- Prisma хранит DateTime как timestamp без зоны в UTC.
          AND "nextAttemptAt" <= (${now().toISOString()}::timestamptz AT TIME ZONE 'UTC')
        ORDER BY "createdAt"
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      const result: OutboxBatchResult = { sent: 0, retried: 0, failed: 0 };
      for (const event of events) {
        try {
          await publish({
            id: event.id,
            type: event.type,
            payload: event.payload
          });
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { status: OutboxStatus.SENT, sentAt: now(), lastError: null }
          });
          result.sent += 1;
        } catch (err) {
          const attempts = event.attempts + 1;
          const exhausted = attempts >= maxAttempts;
          const delay = Math.min(
            baseBackoffMs * 2 ** (attempts - 1),
            maxBackoffMs
          );
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              status: exhausted ? OutboxStatus.ERROR : OutboxStatus.NEW,
              nextAttemptAt: new Date(now().getTime() + delay),
              lastError: err instanceof Error ? err.message : String(err)
            }
          });
          if (exhausted) {
            result.failed += 1;
          } else {
            result.retried += 1;
          }
        }
      }
      return result;
    },
    // Публикация идёт под блокировкой строк; даём пачке время на брокер.
    { timeout: 60_000 }
  );
}
