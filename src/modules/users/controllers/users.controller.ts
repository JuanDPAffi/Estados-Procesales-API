import { Controller, Get, Param, Patch, Put, Body, UseGuards } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { SystemOrJwtGuard } from '../../../common/guards/system-or-jwt.guard'; 
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles, Permissions } from '../../../common/decorators/roles.decorator';
import { PERMISSIONS } from '../../../common/constants/permissions.constant';
import { ValidRoles } from '../../auth/schemas/user.schema';
import { UpdateUserDto } from '../dto/update-user.dto';

@Controller('users')
@UseGuards(SystemOrJwtGuard, RolesGuard) 
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_VIEW) 
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USERS_VIEW)
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.USERS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateUserDto
  ) {
    return this.usersService.update(id, updateDto);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.USERS_ACTIVATE)
  async toggleStatus(@Param('id') id: string) {
    return this.usersService.toggleStatus(id);
  }

  @Put(':id/role')
  @Roles(ValidRoles.ADMIN)
  async changeRole(
    @Param('id') id: string,
    @Body('role') role: string
  ) {
    return this.usersService.changeUserRole(id, role);
  }

  @Put(':id/permissions')
  @Roles(ValidRoles.ADMIN)
  async updatePermissions(
    @Param('id') id: string,
    @Body('permissions') permissions: string[]
  ) {
    return this.usersService.updatePermissions(id, permissions);
  }
}