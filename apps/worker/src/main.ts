import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

const WORKER_PORT = Number(process.env.WORKER_PORT ?? 4100);

/**
 * Boot the worker.
 *
 * It is a full (but minimal) Nest HTTP app rather than a bare application
 * context: this lets BullMQ processors run *and* exposes `GET /health` on 4100
 * for liveness probes. `bufferLogs` defers logging until nestjs-pino is wired so
 * startup lines use the same formatter. `enableShutdownHooks` makes SIGTERM/
 * SIGINT run every module's `onModuleDestroy` (Prisma `$disconnect`, BullMQ
 * worker close), so in-flight jobs drain and connections close cleanly.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  await app.listen(WORKER_PORT, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `AICOS worker up — health on http://0.0.0.0:${WORKER_PORT}/health; queues: extraction, billing`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // Logger may not be available if bootstrap failed early; fall back to console.
  console.error('AICOS worker failed to start', err);
  process.exit(1);
});
