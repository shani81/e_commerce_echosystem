import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Provides the worker's shared ioredis client app-wide. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
