import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Refresh/logout body. Optional now: browser clients send the refresh token in
 * an httpOnly cookie; programmatic clients may still pass it in the body.
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}
