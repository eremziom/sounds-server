-- USER and ARTIST manage only their own profiles. Global profile access stays with ADMIN.
DELETE FROM "RolePermission" AS rp
USING "Role" AS r, "Permission" AS p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."key" IN ('USER', 'ARTIST')
  AND p."key" IN ('users:read', 'users:update');
