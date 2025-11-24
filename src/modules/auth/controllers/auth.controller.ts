import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
  RegisterDto,
  LoginDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // NUEVO ENDPOINT DE ACTIVACIÓN
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activateAccount(@Body() body: { email: string; token: string }) {
    return this.authService.activateAccount(body.email, body.token);
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() requestDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto);
  }
}