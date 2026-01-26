import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedelexModule } from './modules/redelex/redelex.module';
import { MailModule } from './modules/mail/mail.module';
import { InmobiliariaModule } from './modules/inmobiliaria/inmobiliaria.module';
import { UsersModule } from './modules/users/users.module';
import { SupportModule } from './modules/support/support.module';
import { ComercialModule } from './modules/comercial/comercial.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    RedelexModule,
    MailModule,
    InmobiliariaModule,
    UsersModule,
    SupportModule,
    ComercialModule,
    SettingsModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}