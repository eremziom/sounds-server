import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
