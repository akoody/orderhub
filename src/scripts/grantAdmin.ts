import { prisma, disconnectPrisma } from "../shared/db/prisma";

/**
 * Выдать роль ADMIN существующему пользователю:
 *   pnpm admin:grant user@example.com
 * Роль попадает в access-токен при следующем входе или обновлении токена.
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("Usage: pnpm admin:grant <email>");
  }
  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
    select: { id: true, email: true, role: true }
  });
  console.log(`Granted ${user.role} to ${user.email} (${user.id})`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
