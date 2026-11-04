import "dotenv/config";

/**
 * MedCore HMS — Production Environment Validation Script
 * Verifies that all required production environment variables are present and meet
 * security, entropy, and formatting requirements before application bootstrap.
 *
 * NOTE: For security, secret values are NEVER printed to stdout or logs.
 */

interface EnvRule {
  key: string;
  required: boolean;
  minEntropyBytes?: number;
  pattern?: RegExp;
  description: string;
}

const PRODUCTION_RULES: EnvRule[] = [
  {
    key: "NODE_ENV",
    required: true,
    pattern: /^(production|staging|test|development)$/,
    description: "Node execution environment",
  },
  {
    key: "PORT",
    required: true,
    pattern: /^\d{2,5}$/,
    description: "Application HTTP port (e.g. 3001)",
  },
  {
    key: "DATABASE_URL",
    required: true,
    pattern: /^postgresql:\/\/.+/,
    description: "PostgreSQL connection string with sslmode=require in production",
  },
  {
    key: "JWT_ACCESS_SECRET",
    required: true,
    minEntropyBytes: 32,
    description: "Cryptographically secure secret for signing access tokens (>= 32 bytes)",
  },
  {
    key: "JWT_REFRESH_SECRET",
    required: true,
    minEntropyBytes: 32,
    description: "Cryptographically secure secret for signing refresh tokens (>= 32 bytes)",
  },
  {
    key: "FRONTEND_URL",
    required: true,
    pattern: /^https?:\/\/.+/,
    description: "Authoritative frontend URL for CORS origin validation",
  },
];

const OPTIONAL_PRODUCTION_RULES: EnvRule[] = [
  {
    key: "REDIS_HOST",
    required: false,
    description: "Redis host for BullMQ queues",
  },
  {
    key: "AWS_S3_BUCKET_NAME",
    required: false,
    description: "AWS S3 bucket for medical document attachments",
  },
  {
    key: "SENTRY_DSN",
    required: false,
    pattern: /^https:\/\/[^@]+@[^/]+\/\d+$/,
    description: "Sentry DSN for production exception telemetry",
  },
];

export function validateEnvironment(env: Record<string, string | undefined> = process.env): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === "production";
  if (!env.NODE_ENV) {
    warnings.push("NODE_ENV is unset; defaulting to 'development'. In production, set NODE_ENV=production.");
  }

  for (const rule of PRODUCTION_RULES) {
    const val = env[rule.key] || (rule.key === "NODE_ENV" ? "development" : undefined);
    if (!val || val.trim() === "") {
      errors.push(`Missing required environment variable: ${rule.key} (${rule.description})`);
      continue;
    }

    if (val.includes("REPLACE_WITH_") || val.includes("CHANGE_ME")) {
      errors.push(
        `Environment variable ${rule.key} contains default template placeholder; must be replaced with real value.`
      );
    }

    if (rule.pattern && !rule.pattern.test(val)) {
      errors.push(
        `Environment variable ${rule.key} fails validation pattern: ${rule.description}`
      );
    }

    if (rule.minEntropyBytes && val.length < rule.minEntropyBytes) {
      errors.push(
        `Environment variable ${rule.key} is too short (${val.length} chars). Minimum recommended entropy: ${rule.minEntropyBytes} characters.`
      );
    }

    // Production-specific checks
    if (isProduction && rule.key === "DATABASE_URL" && !val.includes("sslmode=")) {
      warnings.push("DATABASE_URL should specify sslmode=require for secure cloud RDS transit.");
    }

    if (isProduction && rule.key === "FRONTEND_URL" && !val.startsWith("https://")) {
      warnings.push("FRONTEND_URL should use HTTPS in production.");
    }
  }

  for (const rule of OPTIONAL_PRODUCTION_RULES) {
    const val = env[rule.key];
    if (!val || val.trim() === "") {
      warnings.push(`Optional variable ${rule.key} is not set; fallback mode will be active.`);
    } else if (rule.pattern && !rule.pattern.test(val)) {
      warnings.push(`Optional variable ${rule.key} format looks non-standard: ${rule.description}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

if (require.main === module) {
  const result = validateEnvironment();
  console.log("==========================================================================");
  console.log("🔐 MedCore HMS Environment Configuration Sanity Audit");
  console.log("==========================================================================");
  if (result.warnings.length > 0) {
    console.log("⚠️  Configuration Warnings:");
    result.warnings.forEach((w) => console.log(`   - ${w}`));
  }
  if (!result.valid) {
    console.error("❌ Environment validation failed with errors:");
    result.errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  } else {
    console.log("✅ All required environment variables validated successfully.");
    console.log("   (Secrets redacted for security)");
    console.log("==========================================================================");
  }
}
