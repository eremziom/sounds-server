-- Revoke only the legacy ADMIN grant. ARTIST and all other permissions survive.
DELETE FROM "RolePermission" AS rp
USING "Role" AS r, "Permission" AS p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."key" = 'ADMIN'
  AND p."key" = 'tracks:create';
