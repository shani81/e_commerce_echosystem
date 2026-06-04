import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ExtractionSource } from '@aicos/db';

/** Start an extraction job from a previously-uploaded MediaAsset (video/photos). */
export class CreateExtractionDto {
  @IsString()
  mediaId!: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsEnum(ExtractionSource)
  source?: ExtractionSource;
}
