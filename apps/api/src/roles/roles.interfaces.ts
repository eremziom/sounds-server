import { Permission } from '../permissions/permissions.interfaces';

export interface Role {
  id: number;
  key: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RolePermissionAssignment {
  permission: Permission;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export type CreateRoleData = Pick<Role, 'key' | 'name' | 'description'>;

export type UpdateRoleData = Partial<CreateRoleData>;
