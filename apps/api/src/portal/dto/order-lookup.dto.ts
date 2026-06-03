import { IsEmail, IsString, MaxLength } from 'class-validator';

/** Guest order lookup by email + order number (storefront portal). */
export class OrderLookupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(40)
  orderNumber!: string;
}
