import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Verificamos en BD cada vez que usan el token
    const user = await this.userModel.findById(payload.id);

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Su cuenta ha sido desactivada');
    }

    // Retornamos los datos limpios al request
    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };
  }
} 