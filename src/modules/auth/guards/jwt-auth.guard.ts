import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const systemToken = this.configService.get<string>('SYSTEM_TASK_TOKEN');

    // Caso 1: Token de sistema (Power Automate)
    if (systemToken && authHeader === systemToken) {
      request.user = { role: 'system' };
      return true;
    }

    // Caso 2: JWT normal (Bearer <token>)
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido');
    }
    return user;
  }
}