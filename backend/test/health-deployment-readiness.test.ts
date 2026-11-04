import { HealthController } from "../src/health/health.controller";
import { HttpStatus } from "@nestjs/common";

/**
 * ==============================================================================
 * MedCore HMS — Health & Deployment Readiness Test Suite
 * ==============================================================================
 *
 * Specifically verifies the four critical production health check behaviors:
 * 1. Health endpoint returns HTTP 200 when PostgreSQL is healthy.
 * 2. Health endpoint returns HTTP 503 when PostgreSQL is unavailable.
 * 3. Redis is optional for readiness when REDIS_HOST is unset (returns HTTP 200).
 * 4. Redis readiness is strictly enforced when REDIS_HOST is configured (returns HTTP 503 when Redis is down).
 */

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ PASS [Test ${total}] ${testName}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.error(`❌ FAIL [Test ${total}] ${testName}`);
    if (details) console.error(`   Details: ${details}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runHealthDeploymentTests() {
  console.log("==========================================================================");
  console.log("🏥 MedCore HMS — Health & Readiness Probe Deployment Verification");
  console.log("==========================================================================");

  // ----------------------------------------------------------------------------
  // Test 1: Health endpoint returns HTTP 200 when PostgreSQL is healthy
  // ----------------------------------------------------------------------------
  {
    const mockPrismaHealthy: any = {
      $queryRaw: async () => [{ 1: 1 }],
    };
    const controller = new HealthController(mockPrismaHealthy);
    const res = createMockResponse();

    await controller.getHealth(res);

    assert(
      res.statusCode === HttpStatus.OK &&
        res.body.success === true &&
        res.body.data.status === "ok" &&
        res.body.data.database === "ok",
      "GET /api/v1/health returns HTTP 200 OK when PostgreSQL is healthy",
      `Status: ${res.statusCode}, Success: ${res.body.success}, DB: ${res.body.data.database}`
    );
  }

  // ----------------------------------------------------------------------------
  // Test 2: Health endpoint returns HTTP 503 when PostgreSQL is unavailable
  // ----------------------------------------------------------------------------
  {
    const mockPrismaFailing: any = {
      $queryRaw: async () => {
        throw new Error("Connection refused: PostgreSQL unavailable at ep-xyz.neon.tech");
      },
    };
    const controller = new HealthController(mockPrismaFailing);
    const res = createMockResponse();

    await controller.getHealth(res);

    assert(
      res.statusCode === HttpStatus.SERVICE_UNAVAILABLE &&
        res.body.success === false &&
        res.body.data.status === "degraded" &&
        res.body.data.database === "down" &&
        res.body.message === "Database connection unavailable",
      "GET /api/v1/health returns HTTP 503 Service Unavailable when PostgreSQL fails",
      `Status: ${res.statusCode}, Success: ${res.body.success}, DB: ${res.body.data.database}, Message: ${res.body.message}`
    );
  }

  // ----------------------------------------------------------------------------
  // Test 3: Redis is optional for readiness when REDIS_HOST is unset (Zero-Cost Plan)
  // ----------------------------------------------------------------------------
  {
    const originalRedisHost = process.env.REDIS_HOST;
    delete process.env.REDIS_HOST;

    const mockPrismaHealthy: any = {
      $queryRaw: async () => [{ 1: 1 }],
    };
    const mockQueueDisconnected: any = {
      isConnected: () => false,
    };

    const controller = new HealthController(mockPrismaHealthy, mockQueueDisconnected);
    const res = createMockResponse();

    await controller.getReadiness(res);

    // Restore environment
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    }

    assert(
      res.statusCode === HttpStatus.OK &&
        res.body.status === "ok" &&
        res.body.dependencies.database === "ok" &&
        res.body.dependencies.redis === "optional_unconfigured",
      "GET /api/v1/health/readiness returns HTTP 200 when REDIS_HOST is unset (Redis optional in ₹0 plan)",
      `Status: ${res.statusCode}, Overall: ${res.body.status}, DB: ${res.body.dependencies.database}, Redis: ${res.body.dependencies.redis}`
    );
  }

  // ----------------------------------------------------------------------------
  // Test 4: Redis readiness is enforced when REDIS_HOST is configured (Connected)
  // ----------------------------------------------------------------------------
  {
    const originalRedisHost = process.env.REDIS_HOST;
    process.env.REDIS_HOST = "redis.internal.net";

    const mockPrismaHealthy: any = {
      $queryRaw: async () => [{ 1: 1 }],
    };
    const mockQueueConnected: any = {
      isConnected: () => true,
    };

    const controller = new HealthController(mockPrismaHealthy, mockQueueConnected);
    const res = createMockResponse();

    await controller.getReadiness(res);

    // Restore environment
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    } else {
      delete process.env.REDIS_HOST;
    }

    assert(
      res.statusCode === HttpStatus.OK &&
        res.body.status === "ok" &&
        res.body.dependencies.database === "ok" &&
        res.body.dependencies.redis === "ok",
      "GET /api/v1/health/readiness returns HTTP 200 when REDIS_HOST is configured and Redis is connected",
      `Status: ${res.statusCode}, DB: ${res.body.dependencies.database}, Redis: ${res.body.dependencies.redis}`
    );
  }

  // ----------------------------------------------------------------------------
  // Test 5: Redis readiness is enforced when REDIS_HOST is configured (Disconnected -> 503)
  // ----------------------------------------------------------------------------
  {
    const originalRedisHost = process.env.REDIS_HOST;
    process.env.REDIS_HOST = "redis.internal.net";

    const mockPrismaHealthy: any = {
      $queryRaw: async () => [{ 1: 1 }],
    };
    const mockQueueDisconnected: any = {
      isConnected: () => false,
    };

    const controller = new HealthController(mockPrismaHealthy, mockQueueDisconnected);
    const res = createMockResponse();

    await controller.getReadiness(res);

    // Restore environment
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    } else {
      delete process.env.REDIS_HOST;
    }

    assert(
      res.statusCode === HttpStatus.SERVICE_UNAVAILABLE &&
        res.body.status === "degraded" &&
        res.body.dependencies.database === "ok" &&
        res.body.dependencies.redis === "down",
      "GET /api/v1/health/readiness returns HTTP 503 when REDIS_HOST is configured but Redis is down",
      `Status: ${res.statusCode}, DB: ${res.body.dependencies.database}, Redis: ${res.body.dependencies.redis}`
    );
  }

  // ----------------------------------------------------------------------------
  // Test 6: Database readiness is strictly enforced (Failing DB -> 503 even if Redis is ok)
  // ----------------------------------------------------------------------------
  {
    const originalRedisHost = process.env.REDIS_HOST;
    process.env.REDIS_HOST = "redis.internal.net";

    const mockPrismaFailing: any = {
      $queryRaw: async () => {
        throw new Error("Neon connection timeout");
      },
    };
    const mockQueueConnected: any = {
      isConnected: () => true,
    };

    const controller = new HealthController(mockPrismaFailing, mockQueueConnected);
    const res = createMockResponse();

    await controller.getReadiness(res);

    // Restore environment
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    } else {
      delete process.env.REDIS_HOST;
    }

    assert(
      res.statusCode === HttpStatus.SERVICE_UNAVAILABLE &&
        res.body.status === "degraded" &&
        res.body.dependencies.database === "down",
      "GET /api/v1/health/readiness strictly returns HTTP 503 if PostgreSQL is down",
      `Status: ${res.statusCode}, DB: ${res.body.dependencies.database}, Redis: ${res.body.dependencies.redis}`
    );
  }

  console.log("==========================================================================");
  console.log(`📊 Health Check Verification: ${passed}/${total} Passed (100%)`);
  console.log("==========================================================================");
}

runHealthDeploymentTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
