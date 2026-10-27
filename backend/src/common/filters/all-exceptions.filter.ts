import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  LoggerService,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { RedactedLoggerService } from '../logging/redacted-logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger: LoggerService;

  constructor(logger?: LoggerService) {
    this.logger = logger || new RedactedLoggerService('AllExceptionsFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage = 'Internal server error';
    let errorDetail: any = undefined;

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      clientMessage = 'Validation failed';
      errorDetail = exception.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        clientMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        clientMessage = resObj.message || clientMessage;
        errorDetail = resObj.error || undefined;
      }
    } else if (exception instanceof Error) {
      // Internal error: do NOT leak SQL queries, driver errors, or stack traces to client
      clientMessage =
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'An unexpected error occurred'
          : exception.message;
    }

    // Log internally with redacted information
    const logContext = {
      path: request?.url,
      method: request?.method,
      statusCode: status,
      error: exception instanceof Error ? exception.message : exception,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= 500) {
      this.logger.error(`HTTP 500 Request Error: ${request?.method} ${request?.url}`, logContext);
    } else {
      this.logger.warn(
        `HTTP ${status} Client Error: ${request?.method} ${request?.url}`,
        logContext,
      );
    }

    // Safe, sanitized response to client
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url,
      message: clientMessage,
      ...(errorDetail ? { error: errorDetail } : {}),
    });
  }
}
