WITH roles_to_seed(key, name, description) AS (
  VALUES
    ('USER', 'User', 'Default user role.'),
    ('ARTIST', 'Artist', 'Artist role for users who can manage their own tracks.'),
    ('ADMIN', 'Admin', 'Administrator role with full management access.')
),
permissions_to_seed(key, name, description) AS (
  VALUES
    ('users:read-own', 'Read own user profile', 'Allows reading the current user profile.'),
    ('users:update-own', 'Update own user profile', 'Allows updating the current user profile.'),
    ('users:read', 'Read users', 'Allows reading users.'),
    ('users:update', 'Update users', 'Allows updating any user profile data.'),
    ('users:delete', 'Delete users', 'Allows deleting users.'),
    ('users:set-role', 'Set user roles', 'Allows assigning or changing user roles.'),
    ('users:set-active', 'Set user active status', 'Allows activating or deactivating users.'),
    ('tracks:read', 'Read tracks', 'Allows reading tracks.'),
    ('tracks:create', 'Create tracks', 'Allows creating tracks.'),
    ('tracks:update-own', 'Update own tracks', 'Allows updating tracks owned by the current user.'),
    ('tracks:update-any', 'Update any track', 'Allows updating any track.'),
    ('tracks:delete-own', 'Delete own tracks', 'Allows deleting tracks owned by the current user.'),
    ('tracks:delete-any', 'Delete any track', 'Allows deleting any track.'),
    ('roles:read', 'Read roles', 'Allows reading roles.'),
    ('roles:create', 'Create roles', 'Allows creating roles.'),
    ('roles:update', 'Update roles', 'Allows updating roles.'),
    ('roles:delete', 'Delete roles', 'Allows deleting roles.'),
    ('permissions:read', 'Read permissions', 'Allows reading permissions.'),
    ('permissions:assign', 'Assign permissions', 'Allows assigning permissions to roles.')
),
inserted_roles AS (
  INSERT INTO "Role" ("key", "name", "description", "updatedAt")
  SELECT key, name, description, NOW()
  FROM roles_to_seed
  ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = NOW()
  RETURNING "id", "key"
),
inserted_permissions AS (
  INSERT INTO "Permission" ("key", "name", "description", "updatedAt")
  SELECT key, name, description, NOW()
  FROM permissions_to_seed
  ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = NOW()
  RETURNING "id", "key"
),
role_permissions_to_seed(role_key, permission_key) AS (
  VALUES
    ('USER', 'users:read-own'),
    ('USER', 'users:update-own'),
    ('USER', 'tracks:read'),
    ('ARTIST', 'users:read-own'),
    ('ARTIST', 'users:update-own'),
    ('ARTIST', 'tracks:read'),
    ('ARTIST', 'tracks:create'),
    ('ARTIST', 'tracks:update-own'),
    ('ARTIST', 'tracks:delete-own'),
    ('ADMIN', 'users:read-own'),
    ('ADMIN', 'users:update-own'),
    ('ADMIN', 'users:read'),
    ('ADMIN', 'users:update'),
    ('ADMIN', 'users:delete'),
    ('ADMIN', 'users:set-role'),
    ('ADMIN', 'users:set-active'),
    ('ADMIN', 'tracks:read'),
    ('ADMIN', 'tracks:create'),
    ('ADMIN', 'tracks:update-own'),
    ('ADMIN', 'tracks:update-any'),
    ('ADMIN', 'tracks:delete-own'),
    ('ADMIN', 'tracks:delete-any'),
    ('ADMIN', 'roles:read'),
    ('ADMIN', 'roles:create'),
    ('ADMIN', 'roles:update'),
    ('ADMIN', 'roles:delete'),
    ('ADMIN', 'permissions:read'),
    ('ADMIN', 'permissions:assign')
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT roles."id", permissions."id"
FROM role_permissions_to_seed
JOIN inserted_roles roles ON roles."key" = role_permissions_to_seed.role_key
JOIN inserted_permissions permissions ON permissions."key" = role_permissions_to_seed.permission_key
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
