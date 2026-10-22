import { IsIn } from 'class-validator';
import type { UserRole } from './users.interfaces';

export const USER_ROLES = ['USER', 'ARTIST', 'ADMIN'] as const;

export class UpdateUserRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRole;
}
