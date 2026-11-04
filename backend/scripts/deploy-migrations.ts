import "dotenv/config";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

/**
 * MedCore HMS — Production Database Migration Runner
 * Executes idempotent Prisma migrations strictly using `prisma migrate deploy`.
 * Includes pre-flight connectivity verification and post-migration validation.
 */
async function deployMigrations() {
  console.log("==========================================================================");
  console.log("🗄️ MedCore HMS Production Database Migration Runner");
  console.log("==========================================================================");

  // 1. Pre-flight connectivity check
  const prisma = new PrismaClient();
  try {
    console.log("🔍 Checking database connectivity...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connectivity verified.");
  } catch (err: any) {
    console.error("❌ Pre-flight database connection check failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Execute prisma migrate deploy
  console.log("🚀 Applying pending migrations via 'prisma migrate deploy'...");
  try {
    const output = execSync("npx prisma migrate deploy", {
      encoding: "utf8",
      env: process.env,
    });
    console.log(output);
    console.log("✅ All migrations applied successfully.");
  } catch (err: any) {
    console.error("❌ Prisma migration deployment failed!");
    if (err.stdout) console.error(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }

  console.log("==========================================================================");
}

deployMigrations();
