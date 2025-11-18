import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from '../schemas/user.schema';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from '../schemas/password-reset-token.schema';
import { MailService } from '../../mail/services/mail.service';
import {
  RegisterDto,
  LoginDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from '../dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetTokenDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private generateToken(user: UserDocument): string {
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  async register(registerDto: RegisterDto) {
    const { name, email, password, role } = registerDto;

    // Verificar si el usuario ya existe
    const existingUser = await this.userModel.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'user',
    });

    // Generar token JWT
    const token = this.generateToken(user);

    // Enviar correo de bienvenida (no bloquea si falla)
    this.mailService.sendWelcomeEmail(user.email, user.name);

    return {
      message: 'Usuario registrado correctamente',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Buscar usuario
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Generar token JWT
    const token = this.generateToken(user);

    return {
      message: 'Login exitoso',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  async requestPasswordReset(requestDto: RequestPasswordResetDto) {
    const { email } = requestDto;

    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
    });

    // Para no revelar si el correo existe o no, siempre respondemos OK
    if (!user) {
      return {
        message:
          'Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.',
      };
    }

    // Generar token aleatorio
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Limpiar tokens previos de este usuario
    await this.passwordResetTokenModel.deleteMany({ userId: user._id });

    // Crear nuevo token
    await this.passwordResetTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    // Construir enlace de reset
    const frontBase =
      this.configService.get<string>('FRONT_BASE_URL') ||
      'http://localhost:4200';
    const resetLink = `${frontBase}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(
      user.email,
    )}`;

    // Enviar correo (no bloquea si falla)
    this.mailService.sendPasswordResetEmail(user.email, user.name, resetLink);

    return {
      message:
        'Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.',
    };
  }

  async resetPassword(resetDto: ResetPasswordDto) {
    const { email, token, password } = resetDto;

    // Buscar usuario
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    // Verificar token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenDoc = await this.passwordResetTokenModel.findOne({
      userId: user._id,
      tokenHash,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    // Actualizar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    // Borrar tokens usados
    await this.passwordResetTokenModel.deleteMany({ userId: user._id });

    return {
      message:
        'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
    };
  }
}