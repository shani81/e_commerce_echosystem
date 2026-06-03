import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Confirm that a presigned upload completed. The client may report the final
 * byte size and an SHA-256 checksum (stored on `sizeBytes` / `checksumSha256`).
 */
export class ConfirmUploadDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksum?: string;
}
