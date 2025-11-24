import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard) // 1. Protegemos con JWT y Roles
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin') // 2. Solo admins pueden ver la lista
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles('admin')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/status') // Endpoint para activar/desactivar
  @Roles('admin')
  async toggleStatus(@Param('id') id: string) {
    return this.usersService.toggleStatus(id);
  }
}