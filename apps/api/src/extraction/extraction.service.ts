import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  EXTRACTION_JOBS,
  QUEUE_NAMES,
  type ExtractionJobData,
} from '@aicos/shared';
import {
  ExtractionJobStatus,
  ExtractionSource,
  ProductStatus,
  ProductType,
  ReviewDecision,
  type Prisma,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { PaginatedResult, PaginationDto } from '../common/dto/pagination.dto';
import type { CreateExtractionDto } from './dto/create-extraction.dto';

/**
 * AI product-extraction orchestration (API side). Starts extraction jobs from an
 * uploaded MediaAsset and enqueues the worker pipeline; serves the job + results
 * for the review UI; and the human gate — `acceptResult` turns a reviewed
 * ExtractionResult into a DRAFT Product (provenance linked via
 * `Product.extractionResultId`). Nothing auto-publishes (decision XT-08).
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.extraction) private readonly queue: Queue,
  ) {}

  async create(tenantId: string, dto: CreateExtractionDto) {
    const media = await this.prisma.forTenant(tenantId, (tx) =>
      tx.mediaAsset.findFirst({
        where: { id: dto.mediaId, tenantId },
        select: { id: true, checksumSha256: true, durationMs: true },
      }),
    );
    if (!media) throw new NotFoundException('Media asset not found');

    const job = await this.prisma.forTenant(tenantId, (tx) =>
      tx.extractionJob.create({
        data: {
          tenantId,
          sourceMediaId: media.id,
          storeId: dto.storeId ?? null,
          source: dto.source ?? ExtractionSource.VIDEO,
          status: ExtractionJobStatus.QUEUED,
          durationSeconds: media.durationMs ? Math.round(media.durationMs / 1000) : null,
        },
        select: { id: true, status: true, source: true, createdAt: true },
      }),
    );

    const data: ExtractionJobData = {
      tenantId,
      extractionRunId: job.id,
      s3ETag: media.checksumSha256 ?? media.id,
      segmentIndex: 0,
    };
    await this.queue.add(EXTRACTION_JOBS.run, data, {
      jobId: `extract__${job.id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
    this.logger.log(`extraction queued job=${job.id} media=${media.id}`);
    return job;
  }

  async list(tenantId: string, query: PaginationDto): Promise<PaginatedResult<unknown>> {
    const { rows, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.extractionJob.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
          select: {
            id: true,
            status: true,
            source: true,
            framesExtracted: true,
            productsFound: true,
            createdAt: true,
            completedAt: true,
            _count: { select: { results: true } },
          },
        }),
        tx.extractionJob.count({ where: { tenantId } }),
      ]);
      return { rows, total };
    });
    return { items: rows, page: query.page, pageSize: query.pageSize, total };
  }

  async findOne(tenantId: string, id: string) {
    const job = await this.prisma.forTenant(tenantId, (tx) =>
      tx.extractionJob.findFirst({
        where: { id, tenantId },
        include: {
          results: {
            orderBy: { overallConfidence: 'desc' },
            include: { reviewItem: true, product: { select: { id: true, slug: true, status: true } } },
          },
        },
      }),
    );
    if (!job) throw new NotFoundException('Extraction job not found');
    return job;
  }

  /** Human gate: accept an extracted result → create a DRAFT product for it. */
  async acceptResult(tenantId: string, resultId: string, userId?: string) {
    const product = await this.prisma.forTenant(tenantId, async (tx) => {
      const result = await tx.extractionResult.findFirst({
        where: { id: resultId, tenantId },
        include: { reviewItem: true, product: { select: { id: true } } },
      });
      if (!result) throw new NotFoundException('Extraction result not found');
      if (result.product) {
        throw new BadRequestException('This result has already been turned into a product');
      }

      const title = result.title?.trim() || 'Untitled product';
      const slug = `${slugify(title)}-${resultId.slice(-6)}`;
      const created = await tx.product.create({
        data: {
          tenantId,
          title,
          slug,
          type: ProductType.PHYSICAL,
          status: ProductStatus.DRAFT,
          description: result.description ?? null,
          aiGenerated: true,
          extractionResultId: result.id,
          variants: {
            create: [
              {
                tenantId,
                title: 'Default',
                priceCents: result.priceCents ?? 0,
                currency: result.currency ?? 'USD',
                ...(result.fieldConfidence
                  ? { fieldConfidence: result.fieldConfidence as Prisma.InputJsonValue }
                  : {}),
              },
            ],
          },
        },
        select: { id: true, slug: true, status: true },
      });

      if (result.reviewItem) {
        await tx.extractionReviewItem.update({
          where: { id: result.reviewItem.id },
          data: {
            decision: ReviewDecision.ACCEPTED,
            reviewedAt: new Date(),
            reviewedByUserId: userId ?? null,
          },
        });
      }
      return created;
    });

    this.logger.log(`extraction result ${resultId} accepted → draft product ${product.id}`);
    return product;
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'product'
  );
}
