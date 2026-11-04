import { Controller, Get, HttpStatus, Res, Inject, Optional } from "@nestjs/common";
import { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ReminderQueueService } from "../notifications/reminder-queue.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(ReminderQueueService) private readonly reminderQueue?: ReminderQueueService
  ) {}

  /**
   * General Health Summary
   * Returns HTTP 200 when database connectivity is healthy; HTTP 503 when database is unavailable.
   */
  @Get()
  async getHealth(@Res() res: Response) {
    let dbStatus = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "down";
    }

    const isHealthy = dbStatus === "ok";
    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      success: isHealthy,
      data: {
        service: "medcore-api",
        status: isHealthy ? "ok" : "degraded",
        database: dbStatus,
        timestamp: new Date().toISOString(),
      },
      message: isHealthy ? "API is running" : "Database connection unavailable",
    });
  }

  /**
   * Kubernetes / Docker Liveness Probe
   * Confirms the Node.js process is active and accepting requests.
   */
  @Get("liveness")
  getLiveness(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: "ok",
      probe: "liveness",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Kubernetes / Docker Readiness Probe
   * Validates operational readiness of critical backing infrastructure (PostgreSQL & Redis).
   * Returns HTTP 200 if all required dependencies are healthy; HTTP 503 if any required dependency is degraded.
   * Redis is optional when REDIS_HOST is unconfigured (₹0 zero-cost plan).
   */
  @Get("readiness")
  async getReadiness(@Res() res: Response) {
    let dbStatus = "ok";

    // 1. PostgreSQL Health Check (Strictly required)
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "down";
    }

    // 2. Redis Cache & Queue Broker Health Check
    // When REDIS_HOST is unconfigured (₹0 zero-cost plan), Redis is optional and in-memory fallback is active.
    const isRedisConfigured = Boolean(
      process.env.REDIS_HOST && process.env.REDIS_HOST.trim() !== ""
    );
    const redisConnected = Boolean(this.reminderQueue?.isConnected());
    const redisStatus = isRedisConfigured
      ? redisConnected
        ? "ok"
        : "down"
      : redisConnected
      ? "ok"
      : "optional_unconfigured";

    const isRedisHealthy = isRedisConfigured ? redisConnected : true;
    const isHealthy = dbStatus === "ok" && isRedisHealthy;
    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      status: isHealthy ? "ok" : "degraded",
      probe: "readiness",
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
