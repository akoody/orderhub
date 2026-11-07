import crypto from "crypto";

/** Заголовок с подписью: `sha256=<hex HMAC-SHA256 от сырого тела запроса>`. */
export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";

export function signWebhookBody(body: string | Buffer, secret: string) {
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

/** Проверка подписи за постоянное время. */
export function isValidWebhookSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string
) {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signWebhookBody(body, secret));
  const actual = Buffer.from(signature);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}
