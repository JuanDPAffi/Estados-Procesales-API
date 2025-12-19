import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SessionSlidingInterceptor } from './common/interceptors/session-sliding.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. DEFINIMOS QUIÉNES TIENEN PERMISO (Lista Blanca)
  const allowedOrigins = [
    'https://estadosprocesales.affi.net', // Tu web en producción
    'http://localhost:4200'               // Tu entorno local
  ];

  // 2. Configuración de CORS Dinámica
  // (Esto debe ir ANTES de que el servidor empiece a escuchar)
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (como Postman o llamadas server-to-server)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('⛔ Bloqueado por CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  // 3. Middlewares Globales
  app.use(cookieParser());
  
  // 4. Pipes y Prefijos
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 5. Interceptors
  app.useGlobalInterceptors(new SessionSlidingInterceptor());

  // --- ERROR ESTABA AQUI: ELIMINADO EL PRIMER app.listen(4000) ---

  // 6. INICIAR EL SERVIDOR (Una sola vez al final)
  const PORT = process.env.PORT || 4000;
  await app.listen(PORT);
  console.log(`🚀 API Redelex corriendo en puerto ${PORT}`);
}

bootstrap();