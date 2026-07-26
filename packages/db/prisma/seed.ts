import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@cs/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const loginId = process.env.SEED_ADMIN_LOGIN_ID ?? "2061";
  const displayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? "Sifat Sami";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "password";

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { loginId },
    update: { displayName, passwordHash, role: "CS_LEAD", isActive: true },
    create: { loginId, displayName, passwordHash, role: "CS_LEAD" },
  });

  console.warn(`Seeded CS_LEAD account for login ID ${loginId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
