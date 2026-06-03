import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DSAR_JOBS, QUEUE_NAMES } from '@aicos/shared';
import { AuditAction, DsarType, StoreStatus, type Prisma } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { ListDsarDto } from './dto/list-dsar.dto';

/**
 * GDPR operations: data-subject access (export) + erasure, and DSAR request
 * intake. The tenant is the data controller; AICOS is the processor. Every
 * export/erase writes an immutable AuditLog row. Async DSARs (from the public
 * portal) are persisted as DsarRequest rows and fulfilled by the worker.
 */
@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.dsar) private readonly dsarQueue: Queue,
  ) {}

  /** DSAR access: full export bundle for a customer (by id). */
  async exportCustomer(tenantId: string, customerId: string) {
    const bundle = await this.prisma.forTenant(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenantId },
        include: { addresses: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      const orders = await tx.order.findMany({
        where: { tenantId, email: { equals: customer.email, mode: 'insensitive' } },
        include: { items: true, returns: true },
      });
      await this.audit(tx, tenantId, AuditAction.EXPORT, customerId, {
        orders: orders.length,
      });
      return { customer, orders };
    });

    return {
      exportedAt: new Date().toISOString(),
      subject: { type: 'customer', id: customerId, email: bundle.customer.email },
      data: bundle,
    };
  }

  /** DSAR erasure: pseudonymize the customer + their order/address PII. */
  async eraseCustomer(tenantId: string, customerId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId } });
      if (!customer) throw new NotFoundException('Customer not found');

      const anonEmail = `erased-${customer.id}@anonymized.invalid`;
      const original = customer.email;

      const orders = await tx.order.updateMany({
        where: { tenantId, email: { equals: original, mode: 'insensitive' } },
        data: { email: anonEmail },
      });
      await tx.address.updateMany({
        where: { tenantId, customerId },
        data: { firstName: null, lastName: null, phone: null, line1: '[erased]', line2: null, company: null },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: {
          email: anonEmail,
          firstName: null,
          lastName: null,
          phone: null,
          note: null,
          deletedAt: new Date(),
        },
      });
      await this.audit(tx, tenantId, AuditAction.ERASE, customerId, { ordersScrubbed: orders.count });
      this.logger.log(`erased customer ${customerId} (${orders.count} orders scrubbed)`);
      return { erased: true, customerId, ordersScrubbed: orders.count };
    });
  }

  /** Public DSAR intake by store slug (resolves the tenant first). */
  async createRequestForStore(slug: string, type: DsarType, subjectEmail: string) {
    const store = await this.prisma.asSystem((tx) =>
      tx.store.findFirst({
        where: { slug, status: StoreStatus.PUBLISHED },
        select: { tenantId: true },
      }),
    );
    if (!store) throw new NotFoundException('Store not found');
    return this.createRequest(store.tenantId, type, subjectEmail);
  }

  /** Record an incoming DSAR (portal) + enqueue async fulfilment. */
  async createRequest(tenantId: string, type: DsarType, subjectEmail: string) {
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const req = await this.prisma.forTenant(tenantId, (tx) =>
      tx.dsarRequest.create({
        data: { tenantId, type, subjectEmail, dueAt },
        select: { id: true, type: true, status: true, dueAt: true },
      }),
    );
    await this.dsarQueue.add(
      DSAR_JOBS.process,
      { tenantId, dsarRequestId: req.id },
      {
        jobId: `dsar__${req.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
    return req;
  }

  async listRequests(tenantId: string, query: ListDsarDto) {
    const where: Prisma.DsarRequestWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const { rows, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.dsarRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        tx.dsarRequest.count({ where }),
      ]);
      return { rows, total };
    });
    return { items: rows, page: query.page, pageSize: query.pageSize, total };
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    action: AuditAction,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: { tenantId, action, entityType: 'customer', entityId, metadata },
    });
  }
}
