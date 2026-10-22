import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CreateRoleDto } from './create-role.dto';
import { RoleWithPermissions } from './roles.interfaces';
import { RolesService } from './roles.service';
import { UpdateRoleDto } from './update-role.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  findAll(): Promise<RoleWithPermissions[]> {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RoleWithPermissions> {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions('roles:create')
  create(@Body() createRoleDto: CreateRoleDto): Promise<RoleWithPermissions> {
    return this.rolesService.create({
      ...createRoleDto,
      description: createRoleDto.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions('roles:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.rolesService.remove(id);
  }

  @Post(':roleId/permissions/:permissionId')
  @RequirePermissions('permissions:assign')
  assignPermission(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.assignPermission(roleId, permissionId);
  }

  @Delete(':roleId/permissions/:permissionId')
  @RequirePermissions('permissions:assign')
  removePermission(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.removePermission(roleId, permissionId);
  }
}
