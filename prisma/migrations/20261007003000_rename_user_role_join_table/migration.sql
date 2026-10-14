-- Rename the legacy enum type so the join table can use the "UserRole" name.
ALTER TYPE "UserRole" RENAME TO "LegacyUserRole";

-- Rename the user-role assignment table to match the Prisma model name.
ALTER TABLE "UserRoleAssignment" RENAME TO "UserRole";

-- Keep constraint names aligned with the renamed table.
ALTER TABLE "UserRole" RENAME CONSTRAINT "UserRoleAssignment_pkey" TO "UserRole_pkey";
ALTER TABLE "UserRole" RENAME CONSTRAINT "UserRoleAssignment_userId_fkey" TO "UserRole_userId_fkey";
ALTER TABLE "UserRole" RENAME CONSTRAINT "UserRoleAssignment_roleId_fkey" TO "UserRole_roleId_fkey";
