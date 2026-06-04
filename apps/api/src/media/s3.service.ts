import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Presigned URL lifetime (seconds) — 15 minutes for both PUT and GET. */
export const PRESIGN_EXPIRES_IN = 900;

/**
 * Thin wrapper over the AWS SDK v3 S3 client, configured for any
 * S3-compatible store (MinIO locally, S3/R2 in prod). The client is created
 * lazily-eagerly in the constructor IFF an endpoint + credentials are present;
 * when storage is unconfigured the service stays up but any presign/IO call
 * throws a clear {@link ServiceUnavailableException} instead of crashing at boot.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client?: S3Client;
  /** Default bucket from config; always defined (has a schema default). */
  public readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('s3.endpoint');
    const region = config.get<string>('s3.region') ?? 'us-east-1';
    const accessKeyId = config.get<string>('s3.accessKey');
    const secretAccessKey = config.get<string>('s3.secretKey');
    const forcePathStyle = config.get<boolean>('s3.forcePathStyle') ?? true;
    this.bucket = config.get<string>('s3.bucket') ?? 'aicos-media';

    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle,
      });
    } else {
      this.logger.warn(
        'S3 is not configured (missing endpoint/credentials); media presigning will return 503',
      );
    }
  }

  /** Whether an S3 client was successfully constructed. */
  get isConfigured(): boolean {
    return Boolean(this.client);
  }

  /** Return the live client or throw a clear 503 if storage is unconfigured. */
  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Object storage is not configured (set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY)',
      );
    }
    return this.client;
  }

  /** Presigned PUT URL a client uses to upload bytes directly to storage. */
  presignUpload(
    key: string,
    contentType: string,
    expiresIn: number = PRESIGN_EXPIRES_IN,
  ): Promise<string> {
    const client = this.requireClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(client, command, { expiresIn });
  }

  /** Upload bytes directly (server-side) — e.g. a product image grabbed from a lookup. */
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Presigned GET URL for time-limited read access to an object. */
  presignDownload(
    key: string,
    expiresIn: number = PRESIGN_EXPIRES_IN,
  ): Promise<string> {
    const client = this.requireClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Delete an object. Missing objects are treated as success (idempotent
   * delete) so a dangling row can always be cleaned up.
   */
  async deleteObject(key: string): Promise<void> {
    const client = this.requireClient();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      if (this.isNotFound(err)) {
        this.logger.debug(`Object already absent on delete: ${key}`);
        return;
      }
      throw err;
    }
  }

  /** True when the S3 error indicates the key does not exist. */
  private isNotFound(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      e.name === 'NoSuchKey' ||
      e.name === 'NotFound' ||
      e.Code === 'NoSuchKey' ||
      e.$metadata?.httpStatusCode === 404
    );
  }
}
