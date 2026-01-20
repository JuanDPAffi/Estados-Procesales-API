import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SystemOrJwtGuard } from '../../common/guards/system-or-jwt.guard';
import { User, UserSchema } from './schemas/user.schema';
import { PasswordResetToken, PasswordResetTokenSchema } from './schemas/password-reset-token.schema';
import { Inmobiliaria, InmobiliariaSchema } from '../../modules/inmobiliaria/schema/inmobiliaria.schema';
import { MailModule } from '../mail/mail.module';
import { SalesTeam, SalesTeamSchema } from '../comercial/schemas/sales-team.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
      { name: Inmobiliaria.name, schema: InmobiliariaSchema },
      { name: SalesTeam.name, schema: SalesTeamSchema },
    ]),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default_secret',
        signOptions: {
          expiresIn: '1d',
        },
      }),
      inject: [ConfigService],
    }),

    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JwtStrategy, 
    JwtAuthGuard, 
    SystemOrJwtGuard 
  ],
  exports: [
    PassportModule, 
    JwtModule, 
    JwtAuthGuard,
    SystemOrJwtGuard
  ],
})
export class AuthModule {}