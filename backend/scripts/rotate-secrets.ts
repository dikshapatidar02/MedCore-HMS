import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";

async function runCleanup() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env file not found at " + envPath);
  }

  // 1. Generate new cryptographically secure secrets
  const newAccessSecret = crypto.randomBytes(32).toString("hex");
  const newRefreshSecret = crypto.randomBytes(32).toString("hex");

  // 2. Safely replace secrets in .env without outputting values
  let content = fs.readFileSync(envPath, "utf8");
  content = content.replace(/JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${newAccessSecret}`);
  content = content.replace(/JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${newRefreshSecret}`);
  fs.writeFileSync(envPath, content, "utf8");
  console.log("SUCCESS: New cryptographically secure JWT secrets generated and written to .env (values omitted for security).");

  // 3. Revoke all active refresh tokens in PostgreSQL
  const prisma = new PrismaClient();
  try {
    const revoked = await prisma.refreshToken.updateMany({
      where: { isRevoked: false },
      data: { isRevoked: true },
    });
    console.log(`SUCCESS: Revoked all active refresh token sessions in database. Count: ${revoked.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup().catch((err) => {
  console.error("Cleanup script failed:", err.message);
  process.exit(1);
});
