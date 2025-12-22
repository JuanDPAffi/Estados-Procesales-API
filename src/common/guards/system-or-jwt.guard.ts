import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class SystemOrJwtGuard extends AuthGuard('jwt') {
  constructor(private configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers['authorization'];
    const systemToken = this.configService.get<string>('SYSTEM_TASK_TOKEN');

    if (authHeader && systemToken && authHeader === systemToken) {
      request.user = { 
        id: 'system', 
        name: 'System Task',
        nombreInmobiliaria: 'System-Inmobiliaria',
        role: 'admin',
        nit: '800000000-System',
        permissions: []
      };
      return true; 
    }

    try {
      return (await super.canActivate(context)) as boolean;
    } catch (e) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
  }
}