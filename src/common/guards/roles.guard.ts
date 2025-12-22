import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/roles.decorator';
import { ValidRoles } from '../../modules/auth/schemas/user.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
        throw new ForbiddenException('Usuario no identificado');
    }

    if (user.role === ValidRoles.ADMIN) {
        return true;
    }

    if (requiredPermissions) {
        const hasPermission = requiredPermissions.some((perm) => user.permissions?.includes(perm));
        if (hasPermission) return true;
    }

    if (requiredRoles) {
        const hasRole = requiredRoles.some((role) => user.role === role);
        if (hasRole) return true;
    }

    throw new ForbiddenException('No tienes los permisos suficientes (Rol o Permiso) para esta acción');
  }
}