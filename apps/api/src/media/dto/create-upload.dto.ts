import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MediaType } from '@aicos/db';

/**
 * Request a presigned upload slot. `kind` maps to the MediaAsset `type` column
 * (defaults to IMAGE when omitted). `contentType` is the object's MIME type and
 * is stored on `mimeType` + baked into the presigned PUT's Content-Type.
 */
export class CreateUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  contentType!: string;

  @IsOptional()
  @IsEnum(MediaType)
  kind?: MediaType;
}
