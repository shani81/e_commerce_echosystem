import { IsString, Matches } from 'class-validator';

/** Manually add a product to an extraction job by its barcode (GTIN/UPC/EAN). */
export class AddBarcodeDto {
  @IsString()
  @Matches(/^\d{6,14}$/, { message: 'Enter a numeric barcode (UPC/EAN, 6–14 digits)' })
  barcode!: string;
}
