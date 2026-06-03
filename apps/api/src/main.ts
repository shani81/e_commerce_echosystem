import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // `rawBody: true` makes platform-express capture the unparsed request body and
  // expose it as `req.rawBody` (a Buffer) IN ADDITION to the normal parsed body.
  // This is what the Stripe webhook needs: Stripe signs the exact bytes it sends,
  // so HMAC verification must run against the raw payload — JSON re-serialisation
  // would change the bytes and break the signature. ONLY StripeWebhookController
  // reads `req.rawBody`; every other route uses the parsed body as usual.
  //
  // `bufferLogs` defers early boot logs until the pino logger is resolved from DI.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Use nestjs-pino as the application logger.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  // Cap JSON/urlencoded body size (the raw buffer is captured by `rawBody: true`).
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });

  // --- Security ------------------------------------------------------------
  app.use(helmet());

  // --- CORS ----------------------------------------------------------------
  const corsOrigins = config.get<boolean | string[]>('http.corsOrigins') ?? true;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // --- Global validation ---------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // --- Routing / lifecycle -------------------------------------------------
  // `/metrics` is excluded so Prometheus can scrape it at the conventional root
  // path; everything else is under `api/v1`.
  app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });
  app.enableShutdownHooks();

  const port = config.get<number>('http.port') ?? 4000;
  await app.listen(port);
  app.get(Logger).log(`AICOS API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
