import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaStatus, MediaType, type MediaAsset } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, PRESIGN_EXPIRES_IN } from './s3.service';
import type {
  PaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto';
import type { CreateUploadDto } from './dto/create-upload.dto';
import type { ConfirmUploadDto } from './dto/confirm-upload.dto';

/** Response for a freshly-created upload slot. */
export interface CreateUploadResult {
  assetId: string;
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

/** An asset enriched with a short-lived presigned GET url. */
export interface MediaAssetWithUrl extends MediaAsset {
  downloadUrl: string;
}

/**
 * Tenant-scoped media management over the MediaAsset model + S3-compatible
 * storage. Every DB statement runs through `prisma.forTenant(tenantId, ...)`,
 * so PostgreSQL RLS guarantees cross-tenant isolation; the storage key is
 * itself tenant-prefixed for defense in depth.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Create a pending MediaAsset row and return a presigned PUT URL the client
   * uses to upload bytes directly to storage.
   */
  async createUpload(
    tenantId: string,
    dto: CreateUploadDto,
    uploadedById?: string,
  ): Promise<CreateUploadResult> {
    const type = dto.kind ?? MediaType.IMAGE;
    const bucket = this.s3.bucket;
    const safeName = this.sanitizeFilename(dto.filename);
    const objectKey = `tenants/${tenantId}/media/${randomUUID()}-${safeName}`;

    // Presign first: if storage is unconfigured this throws 503 before we
    // create an orphan row.
    const uploadUrl = await this.s3.presignUpload(objectKey, dto.contentType);

    const asset = await this.prisma.forTenant(tenantId, (tx) =>
      tx.mediaAsset.create({
        data: {
          tenantId,
          type,
          status: MediaStatus.UPLOADING,
          bucket,
          objectKey,
          mimeType: dto.contentType,
          uploadedById: uploadedById ?? null,
        },
      }),
    );

    return {
      assetId: asset.id,
      uploadUrl,
      storageKey: asset.objectKey,
      expiresIn: PRESIGN_EXPIRES_IN,
    };
  }

  /** Mark an asset READY after a successful upload, recording size/checksum. */
  async confirmUpload(
    tenantId: string,
    id: string,
    dto: ConfirmUploadDto,
  ): Promise<MediaAsset> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.mediaAsset.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Media asset not found');

      return tx.mediaAsset.update({
        where: { id },
        data: {
          status: MediaStatus.READY,
          ...(dto.sizeBytes !== undefined ? { sizeBytes: dto.sizeBytes } : {}),
          ...(dto.checksum !== undefined
            ? { checksumSha256: dto.checksum }
            : {}),
        },
      });
    });
  }

  /** Paginated list of the tenant's media assets (newest first). */
  async list(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<MediaAsset>> {
    const { items, total } = await this.prisma.forTenant(
      tenantId,
      async (tx) => {
        const [rows, count] = await Promise.all([
          tx.mediaAsset.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            skip: pagination.skip,
            take: pagination.take,
          }),
          tx.mediaAsset.count({ where: { tenantId } }),
        ]);
        return { items: rows, total: count };
      },
    );

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  /** Fetch a single asset plus a short-lived presigned GET url. */
  async findOne(tenantId: string, id: string): Promise<MediaAssetWithUrl> {
    const asset = await this.prisma.forTenant(tenantId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id } }),
    );
    if (!asset) throw new NotFoundException('Media asset not found');

    const downloadUrl = await this.s3.presignDownload(asset.objectKey);
    return { ...asset, downloadUrl };
  }

  /**
   * Delete the underlying object then the row. The MediaAsset model has no
   * `deletedAt`, so this is a hard delete; a missing S3 object is ignored.
   */
  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const asset = await this.prisma.forTenant(tenantId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id } }),
    );
    if (!asset) throw new NotFoundException('Media asset not found');

    await this.s3.deleteObject(asset.objectKey);

    await this.prisma.forTenant(tenantId, (tx) =>
      tx.mediaAsset.delete({ where: { id } }),
    );

    return { id };
  }

  /** Strip path separators / control chars from a client-supplied filename. */
  private sanitizeFilename(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
    return cleaned.length > 0 ? cleaned : 'file';
  }
}
