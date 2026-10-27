import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService, AuthResponse, AuthTokens } from '../services/auth.service';
import { RegisterDto, RegisterSchema } from '../dto/register.dto';
import { LoginDto, LoginSchema } from '../dto/login.dto';
import { RefreshTokenDto, RefreshTokenSchema } from '../dto/refresh.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordSchema,
  ResetPasswordDto,
  ResetPasswordSchema,
} from '../dto/password-reset.dto';
import { Public } from '../decorators/public.decorator';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new passenger user account' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email address already exists' })
  async register(@Body() body: RegisterDto): Promise<AuthResponse> {
    const validated = RegisterSchema.parse(body);
    return this.authService.register(validated);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user credentials' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 403, description: 'Account suspended or deactivated' })
  async login(@Body() body: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    const validated = LoginSchema.parse(body);
    const ip = this.extractClientIp(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.login(validated, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new token pair' })
  @ApiResponse({ status: 200, description: 'Tokens rotated successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request): Promise<AuthTokens> {
    const validated = RefreshTokenSchema.parse(body);
    const ip = this.extractClientIp(req);
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.refresh(validated.refreshToken, ip, userAgent);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke active user session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  async logout(@Body() body: RefreshTokenDto): Promise<{ success: boolean; message: string }> {
    const validated = RefreshTokenSchema.parse(body);
    return this.authService.logout(validated.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset instructions' })
  @ApiResponse({ status: 200, description: 'Password reset request accepted' })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const validated = ForgotPasswordSchema.parse(body);
    return this.authService.forgotPassword(validated.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset account password with one-time token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() body: ResetPasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const validated = ResetPasswordSchema.parse(body);
    return this.authService.resetPassword(validated.token, validated.newPassword);
  }

  private extractClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }
}
