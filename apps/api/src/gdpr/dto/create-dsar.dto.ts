import { IsEmail, IsEnum } from 'class-validator';
import { DsarType } from '@aicos/db';

/** Public DSAR intake (storefront): a data subject requests export or erasure. */
export class CreateDsarDto {
  @IsEmail()
  email!: string;

  @IsEnum(DsarType)
  type!: DsarType;
}
