import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Admin";
const resetPassword = process.env.ADMIN_RESET_PASSWORD === "true";

async function main() {
  const userCount = await prisma.user.count();
  console.log(
    [
      "Admin bootstrap:",
      `users=${userCount}`,
      `email=${email || "(missing)"}`,
      `password=${password ? "set" : "missing"}`,
      `reset=${resetPassword ? "true" : "false"}`,
    ].join(" ")
  );

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
    if (resetPassword) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashAdminPassword(password),
          name,
        },
      });
      console.log(`Updated admin password for: ${email}`);
      return;
    }
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashAdminPassword(password),
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

function hashAdminPassword(value) {
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
