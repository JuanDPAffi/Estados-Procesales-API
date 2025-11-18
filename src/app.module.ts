import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedelexModule } from './modules/redelex/redelex.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    // Configuración de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true, // Hace que ConfigService esté disponible globalmente
      envFilePath: '.env',
    }),

    // Módulo de conexión a MongoDB
    DatabaseModule,

    // Módulos funcionales
    AuthModule,
    RedelexModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}