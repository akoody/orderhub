// Значения только для тестов; в CI и локально их можно переопределить.
process.env.JWT_SECRET ??= "test-jwt-secret-0123456789abcdefghijklmnop";
process.env.PAYMENT_WEBHOOK_SECRET ??=
  "test-webhook-secret-0123456789abcdefghij";
process.env.MOCK_PROVIDER_ENABLED ??= "true";
process.env.COOKIE_SECURE ??= "false";
