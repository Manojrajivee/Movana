import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /auth(orization)?/i,
  /cookie/i,
  /key/i,
  /cert(ificate)?/i,
  /conn(ection)?_?str(ing)?/i,
  /credential/i,
  /private/i,
  /bearer/i,
];

@Injectable()
export class RedactedLoggerService implements LoggerService {
  private logLevels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];

  constructor(private readonly contextName: string = 'Movana') {}

  setLogLevels(levels: LogLevel[]) {
    this.logLevels = levels;
  }

  log(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('log')) {
      this.printMessage('INFO', message, optionalParams);
    }
  }

  error(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('error')) {
      this.printMessage('ERROR', message, optionalParams);
    }
  }

  warn(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('warn')) {
      this.printMessage('WARN', message, optionalParams);
    }
  }

  debug(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('debug')) {
      this.printMessage('DEBUG', message, optionalParams);
    }
  }

  verbose(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('verbose')) {
      this.printMessage('VERBOSE', message, optionalParams);
    }
  }

  fatal(message: any, ...optionalParams: any[]) {
    if (this.isLevelEnabled('fatal')) {
      this.printMessage('FATAL', message, optionalParams);
    }
  }

  private isLevelEnabled(level: LogLevel): boolean {
    return this.logLevels.includes(level);
  }

  private printMessage(severity: string, message: any, optionalParams: any[]) {
    const timestamp = new Date().toISOString();
    let context = this.contextName;

    // Check if the last param is a context string
    const params = [...optionalParams];
    if (params.length > 0 && typeof params[params.length - 1] === 'string') {
      context = params.pop();
    }

    const sanitizedMessage = this.redact(message);
    const sanitizedParams = params.map((p) => this.redact(p));

    const logEntry: Record<string, any> = {
      timestamp,
      severity,
      context,
      message: sanitizedMessage,
    };

    if (sanitizedParams.length > 0) {
      logEntry.details = sanitizedParams.length === 1 ? sanitizedParams[0] : sanitizedParams;
    }

    if (process.env.NODE_ENV === 'production') {
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    } else {
      const detailsStr = sanitizedParams.length > 0 ? ' ' + JSON.stringify(sanitizedParams) : '';
      const formatted = `[${timestamp}] [${severity}] [${context}] ${
        typeof sanitizedMessage === 'object' ? JSON.stringify(sanitizedMessage) : sanitizedMessage
      }${detailsStr}\n`;
      if (severity === 'ERROR' || severity === 'FATAL') {
        process.stderr.write(formatted);
      } else {
        process.stdout.write(formatted);
      }
    }
  }

  /**
   * Recursively traverses objects/strings to redact sensitive credentials.
   */
  public redact(input: any): any {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return this.redactString(input);
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.redact(item));
    }

    if (typeof input === 'object') {
      if (input instanceof Error) {
        return {
          name: input.name,
          message: this.redactString(input.message),
          // Do not leak raw stack traces if they contain secrets; redact stack lines
          stack: input.stack ? this.redactString(input.stack) : undefined,
        };
      }

      const cleanObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(input)) {
        if (this.isSensitiveKey(key)) {
          cleanObj[key] = '[REDACTED]';
        } else {
          cleanObj[key] = this.redact(value);
        }
      }
      return cleanObj;
    }

    return input;
  }

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }

  private redactString(str: string): string {
    // Redact Bearer tokens: Bearer eyJ... -> Bearer [REDACTED]
    let result = str.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');

    // Redact connection strings: postgresql://user:pass@host:5432/db -> postgresql://user:[REDACTED]@host:5432/db
    result = result.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@.+)/gi, '$1[REDACTED]$3');
    result = result.replace(/(redis(?:s)?:\/\/[^:]*:?)([^@]+)(@.+)/gi, '$1[REDACTED]$3');

    return result;
  }
}
