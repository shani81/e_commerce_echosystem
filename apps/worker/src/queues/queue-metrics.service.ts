import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from './contracts';
import { MetricsService } from '../metrics/metrics.service';

const POLL_MS = 10_000;
const STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;

/**
 * Periodically samples each BullMQ queue's job counts and publishes them as the
 * `aicos_queue_depth{queue,state}` gauge — the core signal for spotting a
 * backlog (e.g. notifications/dsar piling up `waiting`, or a spike in `failed`).
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly queues: ReadonlyArray<[string, Queue]>;

  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(QUEUE_NAMES.extraction) extraction: Queue,
    @InjectQueue(QUEUE_NAMES.billing) billing: Queue,
    @InjectQueue(QUEUE_NAMES.notifications) notifications: Queue,
    @InjectQueue(QUEUE_NAMES.dsar) dsar: Queue,
  ) {
    this.queues = [
      [QUEUE_NAMES.extraction, extraction],
      [QUEUE_NAMES.billing, billing],
      [QUEUE_NAMES.notifications, notifications],
      [QUEUE_NAMES.dsar, dsar],
    ];
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.collect(), POLL_MS);
    void this.collect();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async collect(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts(...STATES);
        for (const state of STATES) {
          this.metrics.queueDepth.set({ queue: name, state }, counts[state] ?? 0);
        }
      } catch (err) {
        this.logger.debug(`queue-depth sample failed for ${name}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }
}
