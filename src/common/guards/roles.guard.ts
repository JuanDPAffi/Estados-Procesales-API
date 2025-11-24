import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // Si no hay roles requeridos, pasa
    }

    const { user } = context.switchToHttp().getRequest();

    // Verificamos si el usuario tiene el rol necesario
    const hasRole = requiredRoles.some((role) => user?.role === role);

    if (!hasRole) {
        throw new ForbiddenException('No tienes permisos de administrador para realizar esta acción');
    }

    return true;
  }
}