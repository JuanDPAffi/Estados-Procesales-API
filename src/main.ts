import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. DEFINIMOS QUIÉNES TIENEN PERMISO (Lista Blanca)
  const allowedOrigins = [
    'https://estadosprocesales.affi.net', // Tu web en producción
    'http://localhost:4200'               // Tu entorno local
  ];

  // 2. Configuración de CORS Dinámica
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (como Postman o llamadas server-to-server)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        // Si el dominio está en la lista blanca, lo dejamos pasar
        callback(null, true);
      } else {
        // Si no, lo bloqueamos y mostramos quién intentó entrar
        console.log('⛔ Bloqueado por CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Obligatorio para cookies
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const PORT = process.env.PORT || 4000;
  await app.listen(PORT);
  console.log(`🚀 API Redelex corriendo en puerto ${PORT}`);
}

bootstrap();