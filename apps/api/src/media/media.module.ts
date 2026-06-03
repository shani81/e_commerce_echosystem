import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3Service } from './s3.service';

/**
 * Media module — tenant-scoped CRUD over MediaAsset backed by S3-compatible
 * storage (MinIO locally) via presigned uploads/downloads. Relies on the global
 * PrismaModule + ConfigModule; the S3 client is built from the `s3` config block.
 */
@Module({
  controllers: [MediaController],
  providers: [MediaService, S3Service],
  exports: [MediaService, S3Service],
})
export class MediaModule {}
