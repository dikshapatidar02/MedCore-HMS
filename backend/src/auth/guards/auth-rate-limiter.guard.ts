import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Request } from "express";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimiterGuard.name);
  private static readonly attempts = new Map<string, RateLimitRecord>();
  private static readonly MAX_ATTEMPTS = 10; // max 10 login requests per window
  private static readonly WINDOW_MS = 60 * 1000; // 1-minute window

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = request.ip || request.socket.remoteAddress || "unknown_ip";
    const email = request.body?.email ? String(request.body.email).trim().toLowerCase() : "";
    const key = `${clientIp}:${email || "general"}`;
    const now = Date.now();

    const record = AuthRateLimiterGuard.attempts.get(key);

    if (record) {
      if (now > record.resetAt) {
        // Window expired, reset counter
        AuthRateLimiterGuard.attempts.set(key, {
          count: 1,
          resetAt: now + AuthRateLimiterGuard.WINDOW_MS,
        });
        return true;
      }

      if (record.count >= AuthRateLimiterGuard.MAX_ATTEMPTS) {
        const remainingSeconds = Math.ceil((record.resetAt - now) / 1000);
        this.logger.warn(`Rate limit exceeded for login key '${key}'. Blocked for ${remainingSeconds}s.`);
        throw new HttpException(
          {
            success: false,
            error: {
              code: "TOO_MANY_REQUESTS",
              message: `Too many authentication attempts. Please try again after ${remainingSeconds} seconds.`,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      record.count += 1;
    } else {
      AuthRateLimiterGuard.attempts.set(key, {
        count: 1,
        resetAt: now + AuthRateLimiterGuard.WINDOW_MS,
      });
    }

    // Periodically prune stale entries
    if (AuthRateLimiterGuard.attempts.size > 1000) {
      for (const [k, v] of AuthRateLimiterGuard.attempts.entries()) {
        if (now > v.resetAt) {
          AuthRateLimiterGuard.attempts.delete(k);
        }
      }
    }

    return true;
  }

  static reset(keyPrefix?: string) {
    if (keyPrefix) {
      for (const key of AuthRateLimiterGuard.attempts.keys()) {
        if (key.includes(keyPrefix)) {
          AuthRateLimiterGuard.attempts.delete(key);
        }
      }
    } else {
      AuthRateLimiterGuard.attempts.clear();
    }
  }
}
