import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Admin";

async function main() {
  const userCount = await prisma.user.count();

  if (!email || !password) {
    if (userCount === 0) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to create the first admin user.");
    }
    console.log("Admin bootstrap skipped because admin credentials were not provided.");
    return;
  }

  if (process.env.NODE_ENV === "production" && password === "change-me-on-first-run") {
    throw new Error("ADMIN_PASSWORD must be changed before production startup.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
    },
  });

  console.log(`Created admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
