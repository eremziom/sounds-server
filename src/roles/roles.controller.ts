import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateRoleDto } from './create-role.dto';
import { RoleWithPermissions } from './roles.interfaces';
import { RolesService } from './roles.service';
import { UpdateRoleDto } from './update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll(): Promise<RoleWithPermissions[]> {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RoleWithPermissions> {
    return this.rolesService.findOne(id);
  }

  @Post()
  create(@Body() createRoleDto: CreateRoleDto): Promise<RoleWithPermissions> {
    return this.rolesService.create({
      ...createRoleDto,
      description: createRoleDto.description ?? null,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.rolesService.remove(id);
  }

  @Post(':roleId/permissions/:permissionId')
  assignPermission(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.assignPermission(roleId, permissionId);
  }

  @Delete(':roleId/permissions/:permissionId')
  removePermission(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.removePermission(roleId, permissionId);
  }
}
