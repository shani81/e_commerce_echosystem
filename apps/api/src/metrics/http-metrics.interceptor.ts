import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Records every HTTP request's duration into the Prometheus histogram, labelled
 * by method, matched route pattern, and status. The `route` label uses the
 * Express route pattern (e.g. `/users/:id`), NOT the raw URL, so path params
 * don't explode metric cardinality; unmatched requests are bucketed as `unmatched`.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const start = process.hrtime.bigint();

    const record = (): void => {
      const res = http.getResponse<Response>();
      const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpDuration.observe(
        { method: req.method, route, status: String(res.statusCode) },
        seconds,
      );
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
