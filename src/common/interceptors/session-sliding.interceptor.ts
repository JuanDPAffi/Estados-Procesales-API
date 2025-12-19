import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response, Request } from 'express';

@Injectable()
export class SessionSlidingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // 1. Verificamos si existe la cookie de sesión en la petición entrante
        const token = request.cookies['redelex_token'];

        // Si hay token y no es un logout (para evitar revivir una sesión que se está cerrando)
        if (token && !request.url.includes('logout')) {
          
          const isProduction = process.env.NODE_ENV === 'production';

          // 2. RENOVAMOS LA COOKIE
          // Al establecer la misma cookie con el mismo valor, pero nueva maxAge,
          // el navegador reinicia el tiempo de expiración.
          response.cookie('redelex_token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            domain: isProduction ? 'affi.net' : undefined,
            maxAge: 1000 * 60 * 60,
          });
        }
      }),
    );
  }
}