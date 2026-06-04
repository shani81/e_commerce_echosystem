import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  AuditAction,
  DsarStatus,
  DsarType,
  withTenant,
  type Prisma,
} from '@aicos/db';
import { DSAR_JOBS, QUEUE_NAMES, type DsarJobData } from './contracts';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Consumer for the `dsar` queue — fulfils GDPR data-subject requests on the
 * 30-day SLA. EXPORT gathers the subject's data (a signed S3 bundle URL in prod;
 * here it audits + completes). ERASURE pseudonymizes the customer + their order/
 * address PII. Every action writes an immutable AuditLog row. Idempotent: a
 * COMPLETED/REJECTED request is skipped.
 */
@Processor(QUEUE_NAMES.dsar)
export class DsarProcessor extends WorkerHost {
  private readonly logger = new Logger(DsarProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<DsarJobData>): Promise<{ handled: boolean }> {
    if (job.name !== DSAR_JOBS.process) {
      this.logger.warn(`dsar ignoring unknown job name="${job.name}"`);
      return { handled: false };
    }
    const { tenantId, dsarRequestId } = job.data;

    const processedType = await withTenant(this.prisma.client, tenantId, async (tx) => {
      const req = await tx.dsarRequest.findFirst({ where: { id: dsarRequestId } });
      if (!req) {
        this.logger.warn(`dsar request ${dsarRequestId} not found`);
        return null;
      }
      if (req.status === DsarStatus.COMPLETED || req.status === DsarStatus.REJECTED) return null;

      await tx.dsarRequest.update({
        where: { id: req.id },
        data: { status: DsarStatus.PROCESSING },
      });

      if (req.type === DsarType.ERASURE) {
        const scrubbed = await this.erase(tx, req.subjectEmail);
        await this.audit(tx, tenantId, AuditAction.ERASE, req.id, {
          subjectEmail: req.subjectEmail,
          ...scrubbed,
        });
      } else {
        const orders = await tx.order.count({
          where: { email: { equals: req.subjectEmail, mode: 'insensitive' } },
        });
        const hasCustomer = Boolean(
          await tx.customer.findFirst({
            where: { email: { equals: req.subjectEmail, mode: 'insensitive' } },
            select: { id: true },
          }),
        );
        await this.audit(tx, tenantId, AuditAction.EXPORT, req.id, {
          subjectEmail: req.subjectEmail,
          hasCustomer,
          orders,
        });
      }

      await tx.dsarRequest.update({
        where: { id: req.id },
        data: { status: DsarStatus.COMPLETED, completedAt: new Date() },
      });
      return req.type;
    });

    if (processedType) {
      this.metrics.dsarProcessed.inc({ type: String(processedType).toLowerCase() });
    }
    this.logger.log(`dsar ${dsarRequestId} processed`);
    return { handled: true };
  }

  private async erase(
    tx: Prisma.TransactionClient,
    email: string,
  ): Promise<{ customerErased: boolean; ordersScrubbed: number }> {
    const customer = await tx.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    const anon = customer
      ? `erased-${customer.id}@anonymized.invalid`
      : 'erased@anonymized.invalid';

    const orders = await tx.order.updateMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      data: { email: anon },
    });
    if (customer) {
      await tx.address.updateMany({
        where: { customerId: customer.id },
        data: { firstName: null, lastName: null, phone: null, line1: '[erased]', line2: null, company: null },
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: { email: anon, firstName: null, lastName: null, phone: null, note: null, deletedAt: new Date() },
      });
    }
    return { customerErased: Boolean(customer), ordersScrubbed: orders.count };
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    action: AuditAction,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { tenantId, action, entityType: 'dsar', entityId, metadata },
    });
  }
}
