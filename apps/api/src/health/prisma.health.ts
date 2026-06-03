import { Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness/readiness check for PostgreSQL. Runs a trivial `SELECT 1` through
 * `asSystem` (no tenant context needed for a connectivity probe).
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.asSystem((tx) => tx.$queryRaw`SELECT 1`);
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return this.getStatus(key, false, { message });
    }
  }
}
