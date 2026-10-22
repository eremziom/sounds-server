import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { Permission } from './permissions.interfaces';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('permissions:read')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  findAll(): Promise<Permission[]> {
    return this.permissionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Permission> {
    return this.permissionsService.findOne(id);
  }
}
