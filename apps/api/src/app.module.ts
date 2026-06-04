import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { configuration, validateEnv } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { IamModule } from './iam/iam.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { MediaModule } from './media/media.module';
import { SearchModule } from './search/search.module';
import { StorefrontModule } from './storefront/storefront.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { ConnectModule } from './connect/connect.module';
import { OrdersModule } from './orders/orders.module';
import { ShippingModule } from './shipping/shipping.module';
import { ReturnsModule } from './returns/returns.module';
import { PortalModule } from './portal/portal.module';
import { GdprModule } from './gdpr/gdpr.module';
import { ImportModule } from './import/import.module';
import { ExtractionModule } from './extraction/extraction.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Root application module.
 *
 * Wiring highlights:
 *  - ConfigModule is global; env is validated by zod (`validateEnv`) at boot.
 *  - LoggerModule (nestjs-pino) is the app logger; pretty-prints in dev.
 *  - BullModule connects to Redis (REDIS_URL) for the billing queue.
 *  - A GLOBAL JwtAuthGuard enforces auth on every route except those marked
 *    `@Public()`; the global RolesGuard runs after it for `@Permissions(...)`.
 *  - TenantMiddleware runs for ALL routes, populating the AsyncLocalStorage
 *    tenant context from the verified access token / X-Tenant-Id.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Single source for local dev: app-specific apps/api/.env wins, else the
      // repo-root .env. Real process env always takes precedence over both.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
      load: [configuration],
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<boolean>('isProduction') ?? false;
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            autoLogging: true,
          },
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('redis.url') },
      }),
    }),

    // Global rate limit (200 req / 60s / IP); auth endpoints add a tighter
    // @Throttle (10/min). Storage is in-memory (per-instance) — move to the
    // Redis storage adapter when scaling horizontally.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),

    PrismaModule,
    AuthModule,
    IamModule,
    BillingModule,
    HealthModule,
    MetricsModule,
    CatalogModule,
    InventoryModule,
    MediaModule,
    SearchModule,
    StorefrontModule,
    CartModule,
    CheckoutModule,
    ConnectModule,
    OrdersModule,
    ShippingModule,
    ReturnsModule,
    PortalModule,
    GdprModule,
    ImportModule,
    ExtractionModule,
  ],
  providers: [
    // Guard order matters: rate-limit first, then CSRF (cookie sessions), then
    // authn (JwtAuthGuard), then authz (RolesGuard).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  /** Apply the tenant-context middleware to every route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
