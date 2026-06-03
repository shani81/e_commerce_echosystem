import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { HealthController } from './health/health.controller';

/**
 * Root module for the worker process.
 *
 * - `ConfigModule` is global so env (REDIS_URL, NODE_ENV, …) is injectable
 *   everywhere; in dev it loads the repo-root `.env`.
 * - `LoggerModule` (nestjs-pino) is the single logger; pretty in dev, JSON in
 *   prod. It also installs `pino-http` for the health endpoint's request logs.
 * - `BullModule.forRoot` opens the shared Redis connection parsed from
 *   `REDIS_URL`; queues are registered in `QueuesModule`.
 * - `PrismaModule` owns the one PrismaClient (global).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
          },
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6400';
        const redis = new URL(url);
        return {
          connection: {
            host: redis.hostname,
            port: Number(redis.port) || 6379,
            username: redis.username || undefined,
            password: redis.password || undefined,
            // BullMQ requires this for blocking commands.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    QueuesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
