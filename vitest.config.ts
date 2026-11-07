import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Тесты работают с одной базой и чистят её перед каждым сценарием.
    fileParallelism: false
  }
});
