import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type TokenPair } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
  type CookieConfig,
} from './auth-cookies';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/** Tighter limit on auth endpoints (10/min/IP) to blunt brute force. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

type ReqWithCookies = Request & { cookies?: Record<string, string> };

/**
 * Auth endpoints (→ `/api/v1/auth/*`). Signup/login/refresh/logout are
 * `@Public()` and rate-limited; they set/rotate/clear the httpOnly session
 * cookies (P2.2). The token pair is still returned in the body for programmatic
 * clients (the worker, curl, tests); browsers rely on the cookies.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieCfg(): CookieConfig {
    return {
      secure: this.config.get<boolean>('isProduction') ?? false,
      accessTtl: this.config.get<string>('jwt.accessTtl') ?? '15m',
      refreshTtl: this.config.get<string>('jwt.refreshTtl') ?? '30d',
    };
  }

  /** Set cookies + return the pair (with the freshly-issued CSRF token). */
  private issue(res: Response, tokens: TokenPair) {
    const csrfToken = setAuthCookies(res, tokens, this.cookieCfg());
    return { ...tokens, csrfToken };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.signup(dto));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.auth.login(dto));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    return this.issue(res, await this.auth.refresh(token));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    clearAuthCookies(res, this.cookieCfg().secure);
    if (token) await this.auth.logout(token);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }
}
