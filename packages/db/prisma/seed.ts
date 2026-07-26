import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@cs/shared";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName: "CS Lead", passwordHash, role: "CS_LEAD" },
  });

  console.warn(`Seeded CS_LEAD account for ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
