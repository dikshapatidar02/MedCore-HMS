import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

/**
 * MedCore HMS — Production Database Migration Runner
 *
 * Enforces strict preflight safety guards:
 * 1. Requires DATABASE_URL explicitly from process environment (no silent .env fallback).
 * 2. Rejects localhost, 127.0.0.1, and local development hostnames.
 * 3. Enforces Neon PostgreSQL direct connection (*.neon.tech, without -pooler).
 * 4. Displays sanitized database target (no credentials/passwords).
 * 5. Requires explicit user confirmation ('yes') before executing migrations.
 * 6. Executes non-destructive `prisma migrate deploy` only.
 */

export interface SanitizedDatabaseTarget {
  protocol: string;
  host: string;
  port: string;
  database: string;
  sslMode?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  target?: SanitizedDatabaseTarget;
}

export function validateDatabaseUrl(rawUrl: string | undefined): ValidationResult {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      valid: false,
      error:
        "DATABASE_URL is missing from the process environment.\n" +
        "To prevent accidental execution, migrations will NOT silently load a local .env file.\n" +
        "You must explicitly provide DATABASE_URL in your current terminal session.\n\n" +
        "Example (PowerShell):\n" +
        '  $env:DATABASE_URL="postgresql://<user>:<password>@<neon-direct-host>/<db>?sslmode=require"\n' +
        "Example (Bash):\n" +
        '  export DATABASE_URL="postgresql://<user>:<password>@<neon-direct-host>/<db>?sslmode=require"',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return {
      valid: false,
      error: "DATABASE_URL is not a valid URL format.",
    };
  }

  // 1. Protocol check
  const protocol = parsed.protocol.replace(":", "").toLowerCase();
  if (protocol !== "postgresql" && protocol !== "postgres") {
    return {
      valid: false,
      error: `Invalid protocol '${protocol}:'. Production database must use 'postgresql:' or 'postgres:'.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const normalizedHost = hostname.replace(/^\[|\]$/g, "");

  // 2. Reject local hostnames
  const localHostPatterns = [
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "0.0.0.0",
    "host.docker.internal",
  ];
  if (
    localHostPatterns.includes(hostname) ||
    localHostPatterns.includes(normalizedHost) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      valid: false,
      error:
        `Security violation: Target hostname '${hostname}' is a local development address.\n` +
        "Production migrations cannot be run against local or development databases.",
    };
  }

  // 3. Require Neon hostname ending in .neon.tech
  if (!hostname.endsWith(".neon.tech")) {
    return {
      valid: false,
      error:
        `Invalid target host '${hostname}'. For this production deployment workflow, ` +
        "DATABASE_URL must target a Neon PostgreSQL database ending in '.neon.tech'.",
    };
  }

  // 4. Reject pooled connections (-pooler)
  if (hostname.includes("-pooler")) {
    return {
      valid: false,
      error:
        `Invalid target host '${hostname}'. Hostname contains '-pooler' (pooled endpoint).\n` +
        "Prisma migrations require DDL advisory locks and must use Neon's DIRECT connection string (without '-pooler').\n" +
        "In Neon Console, uncheck 'Connection pooling' to copy the direct URL.",
    };
  }

  // 5. SSL safety check
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "disable") {
    return {
      valid: false,
      error: "Security violation: 'sslmode=disable' is not permitted for production Neon connections.",
    };
  }

  const database = parsed.pathname.replace(/^\/+/, "") || "(default)";

  return {
    valid: true,
    target: {
      protocol,
      host: hostname,
      port: parsed.port || "5432",
      database,
      sslMode: sslMode || undefined,
    },
  };
}

export async function promptConfirmation(target: SanitizedDatabaseTarget): Promise<boolean> {
  const isConfirmedViaFlag =
    process.argv.includes("--confirm") ||
    process.env.MEDCORE_CONFIRM_MIGRATE === "true";

  if (isConfirmedViaFlag) {
    console.log("ℹ️ Explicit confirmation flag detected (--confirm / MEDCORE_CONFIRM_MIGRATE=true). Proceeding.");
    return true;
  }

  if (!process.stdin.isTTY) {
    console.error("\n❌ Non-interactive environment detected without explicit confirmation.");
    console.error("In non-interactive mode (such as CI/CD), supply '--confirm' or set MEDCORE_CONFIRM_MIGRATE=true.");
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  CONFIRMATION REQUIRED: Apply pending migrations to '${target.host}' / '${target.database}'? Type 'yes' to proceed: `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "yes") {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    );
  });
}

export async function deployMigrations() {
  console.log("==========================================================================");
  console.log("🗄️ MedCore HMS Production Database Migration Runner");
  console.log("==========================================================================");

  // 1. Validate DATABASE_URL from process environment
  const rawUrl = process.env.DATABASE_URL;
  const validation = validateDatabaseUrl(rawUrl);

  if (!validation.valid || !validation.target) {
    console.error("\n❌ DATABASE_URL VALIDATION FAILED:");
    console.error(validation.error);
    console.error("\nMigration aborted. No database connection was attempted.\n");
    process.exit(1);
  }

  const { target } = validation;

  // 2. Display sanitized target details (no credentials/passwords)
  console.log("\nTarget Database Configuration (Sanitized):");
  console.log(`  • Host:     ${target.host}`);
  console.log(`  • Port:     ${target.port}`);
  console.log(`  • Database: ${target.database}`);
  console.log(`  • Protocol: ${target.protocol}`);
  console.log(`  • SSL Mode: ${target.sslMode || "require"}`);

  // 3. Explicit Confirmation Guard
  const confirmed = await promptConfirmation(target);
  if (!confirmed) {
    console.log("\n❌ Migration deployment cancelled. No database changes were made.\n");
    process.exit(0);
  }

  // 4. Pre-flight connectivity check
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: rawUrl,
      },
    },
  });

  try {
    console.log("\n🔍 Checking database connectivity to Neon...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Neon database connectivity verified.");
  } catch (err: any) {
    console.error("❌ Pre-flight database connection check failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  // 5. Execute prisma migrate deploy
  console.log("\n🚀 Applying pending migrations via 'prisma migrate deploy'...");
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

// Only execute directly when invoked from the command line
const isDirectExecution =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("deploy-migrations.ts") ||
    process.argv[1].endsWith("deploy-migrations.js"));

if (isDirectExecution) {
  deployMigrations().catch((err) => {
    console.error("Fatal error during migration deployment:", err);
    process.exit(1);
  });
}
