import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { seedDemoData, DEMO_CONFIG } from "../src/auth/demo-seed";

// Load .env if process.env.DATABASE_URL is not set
function loadLocalEnv() {
  const candidates = [
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadLocalEnv();

export async function runDemoBootstrap() {
  console.log("==========================================================================");
  console.log("🏥 MedCore HMS — Public Demo Access System Bootstrap");
  console.log("==========================================================================\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is not set in the environment.");
    process.exit(1);
  }

  // Display sanitized database destination
  try {
    const parsed = new URL(databaseUrl.trim());
    console.log("Database Destination (Sanitized):");
    console.log(`  • Host:     ${parsed.hostname}`);
    console.log(`  • Database: ${parsed.pathname.replace(/^\/+/, "") || "default"}\n`);
  } catch {
    console.log("  • Database target parsed.\n");
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl.trim() } },
  });

  try {
    await seedDemoData(prisma, {
      log: (msg: string) => console.log(msg),
      error: (msg: string, ...args: any[]) => console.error(msg, ...args),
    });

    console.log("\n==========================================================================");
    console.log("🎉 Public Demo Access System Ready");
    console.log("==========================================================================");
    console.log(`Hospital:  ${DEMO_CONFIG.hospitalName} (${DEMO_CONFIG.hospitalCode})`);
    console.log(`Password:  ${DEMO_CONFIG.password}\n`);
    console.log("Preconfigured Demo Accounts:");
    console.log(`  • Hospital Admin: ${DEMO_CONFIG.accounts.admin}`);
    console.log(`  • Doctor:         ${DEMO_CONFIG.accounts.doctor}`);
    console.log(`  • Nurse:          ${DEMO_CONFIG.accounts.nurse}`);
    console.log(`  • Receptionist:   ${DEMO_CONFIG.accounts.receptionist}`);
    console.log(`  • Pharmacist:     ${DEMO_CONFIG.accounts.pharmacist}`);
    console.log(`  • Lab Tech:       ${DEMO_CONFIG.accounts.lab}`);
    console.log(`  • Accountant:     ${DEMO_CONFIG.accounts.billing}`);
    console.log("==========================================================================\n");
  } catch (error: any) {
    console.error("❌ Demo bootstrap failed:", error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runDemoBootstrap();
}

