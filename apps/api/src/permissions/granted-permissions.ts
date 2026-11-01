export interface UserPermissionRecord {
  roles: {
    role: {
      permissions: { permission: { key: string } }[];
    };
  }[];
}

// Shared by session discovery and authorization; never use JWT role claims here.
export function getGrantedPermissions(user: UserPermissionRecord): Set<string> {
  return new Set(
    user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => permission.key),
    ),
  );
}
