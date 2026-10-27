import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedactedLoggerService } from './common/logging/redacted-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new RedactedLoggerService('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  const host = configService.get<string>('host', '0.0.0.0');
  const env = configService.get<string>('env', 'development');
  const corsOrigin = configService.get<string>('corsOrigin', 'http://localhost:3000');
  const swaggerEnabled = configService.get<boolean>('swaggerEnabled', true);

  // Enable graceful termination lifecycle hooks (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  // Centralized exception handling
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // Conservative CORS configuration
  const allowedOrigins = corsOrigin.includes(',')
    ? corsOrigin.split(',').map((origin) => origin.trim())
    : corsOrigin;

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // Minimal Swagger OpenAPI documentation (foundation only, no business endpoints)
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Movana Platform API')
      .setDescription('Authoritative backend foundation services for Movana transit platform')
      .setVersion('1.0.0')
      .addTag('Health', 'Operational liveness and readiness telemetry')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`OpenAPI documentation initialized at http://${host}:${port}/api/docs`);
  }

  await app.listen(port, host);
  logger.log(`Movana backend service listening on http://${host}:${port} [Environment: ${env}]`);
}

bootstrap().catch((err) => {
  const logger = new RedactedLoggerService('BootstrapError');
  logger.fatal(`Fatal startup error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
