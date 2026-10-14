-- Drop the legacy enum role column. RBAC roles are stored in "UserRole".
ALTER TABLE "User" DROP COLUMN "role";

-- Drop the legacy enum type after the last dependent column is gone.
DROP TYPE "LegacyUserRole";
