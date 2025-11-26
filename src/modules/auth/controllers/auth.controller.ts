import { Controller, Post, Get, Body, HttpCode, HttpStatus, Res, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
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
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const loginResult = await this.authService.login(loginDto);
    
    // --- LÓGICA INTELIGENTE (PROD vs DEV) ---
    // Detectamos si estamos en Azure o en Localhost
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('redelex_token', loginResult.token, {
      httpOnly: true, 
      
      // En producción (HTTPS) es true, en local (HTTP) es false
      secure: isProduction,   
      
      // 'none' requiere secure=true. En local usamos 'lax' para que no falle.
      sameSite: isProduction ? 'none' : 'lax', 
      
      // En local NO ponemos dominio (usa localhost). En prod forzamos affi.net
      domain: isProduction ? 'affi.net' : undefined, 
      
      // CORREGIDO: 30 Minutos reales
      maxAge: 1000 * 60 * 30, 
    });

    return {
      user: loginResult.user, 
      message: 'Login exitoso'
    };
  }
  
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // Usamos la misma lógica para poder borrar la cookie correctamente
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('redelex_token', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      domain: isProduction ? 'affi.net' : undefined,
      expires: new Date(0), 
    });
    return { message: 'Sesión cerrada' };
  }

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

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Req() req) {
    return req.user; 
  }
}