import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = "INTERNAL_SERVER_ERROR";
    let message = "An internal server error occurred. Please contact support.";

    const isHttpException =
      exception instanceof HttpException ||
      (exception !== null &&
        typeof exception === "object" &&
        typeof (exception as any).getStatus === "function");

    if (isHttpException) {
      status = (exception as any).getStatus();
      const exceptionResponse = (exception as any).getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const res = exceptionResponse as any;
        if (Array.isArray(res.message)) {
          message = res.message.join("; ");
        } else if (res.message) {
          message = res.message;
        }
        if (res.error) {
          errorCode = String(res.error).toUpperCase().replace(/\s+/g, "_");
        }
      }

      switch (status) {
        case HttpStatus.UNAUTHORIZED:
          errorCode = "UNAUTHORIZED";
          break;
        case HttpStatus.FORBIDDEN:
          errorCode = "FORBIDDEN";
          break;
        case HttpStatus.NOT_FOUND:
          errorCode = "NOT_FOUND";
          break;
        case HttpStatus.BAD_REQUEST:
          errorCode = "BAD_REQUEST";
          break;
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}:`,
        exception instanceof Error ? exception.stack : exception
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
      },
    });
  }
}
