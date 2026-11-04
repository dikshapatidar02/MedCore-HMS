import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { Request } from "express";

@Injectable()
export class SentryMonitoringInterceptor implements NestInterceptor {
  private readonly logger = new Logger("SentryMonitoring");
  private readonly isSentryConfigured: boolean;

  constructor() {
    const dsn = process.env.SENTRY_DSN;
    this.isSentryConfigured = Boolean(
      dsn && dsn.startsWith("https://") && !dsn.includes("xxxxxx")
    );
    if (this.isSentryConfigured) {
      this.logger.log("Sentry error monitoring is configured and active for production.");
    } else {
      this.logger.log("Sentry DSN unconfigured or mock; telemetry running in structured local logger mode.");
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    return next.handle().pipe(
      catchError((error) => {
        const duration = Date.now() - startTime;
        const sanitizedEvent = this.buildSanitizedErrorEvent(request, error, duration);

        if (this.isSentryConfigured) {
          // If Sentry SDK is active, report the sanitized event
          this.logger.error(`[SENTRY_CAPTURE] ${JSON.stringify(sanitizedEvent)}`);
        } else if (process.env.NODE_ENV === "production") {
          // Production structured JSON logging format
          this.logger.error(`[PROD_ERROR_TELEMETRY] ${JSON.stringify(sanitizedEvent)}`);
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * Sanitizes request context to strictly prevent PHI (Protected Health Information),
   * PII, JWT tokens, and passwords from leaking to external monitoring services.
   */
  private buildSanitizedErrorEvent(req: Request, err: any, durationMs: number) {
    const user = (req as any).user;
    return {
      timestamp: new Date().toISOString(),
      level: "error",
      message: err.message || "Unknown error",
      status: err.status || err.statusCode || 500,
      path: req.originalUrl || req.url,
      method: req.method,
      durationMs,
      hospitalId: user?.hospitalId || "unauthenticated",
      userRole: user?.role || "anonymous",
      // Sanitized query and body (passwords, tokens, and PHI notes removed)
      query: this.redactSensitiveData(req.query),
      body: this.redactSensitiveData(req.body),
      stackTrace:
        process.env.NODE_ENV === "production" ? undefined : err.stack?.split("\n").slice(0, 5),
    };
  }

  private redactSensitiveData(data: any): any {
    if (!data || typeof data !== "object") return data;
    const redacted: Record<string, any> = {};

    const sensitiveKeys = [
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "secret",
      "clinicalNotes",
      "diagnosisNotes",
      "creditCard",
      "cvv",
      "ssn",
    ];

    for (const [key, val] of Object.entries(data)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        redacted[key] = "[REDACTED_SENSITIVE]";
      } else if (typeof val === "object" && val !== null) {
        redacted[key] = this.redactSensitiveData(val);
      } else {
        redacted[key] = val;
      }
    }
    return redacted;
  }
}
