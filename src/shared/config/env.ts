import { z } from "zod";

const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters`);

const envSchema = z.object({
  JWT_SECRET: secret("JWT_SECRET"),
  /** Общий секрет с платёжным провайдером для подписи вебхуков. */
  PAYMENT_WEBHOOK_SECRET: secret("PAYMENT_WEBHOOK_SECRET"),
  /** Маршрут /provider/mock/pay: только для разработки и тестов. */
  MOCK_PROVIDER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Secure-флаг refresh-cookie; выключается только для локального HTTP. */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true")
});

export type AppConfig = z.infer<typeof envSchema>;

/** Проверяет окружение при старте; без секретов сервис не запускается. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
