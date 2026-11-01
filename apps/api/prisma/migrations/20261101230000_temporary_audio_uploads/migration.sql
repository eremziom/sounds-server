CREATE TYPE "AudioUploadStatus" AS ENUM ('PENDING', 'CONSUMED', 'CANCELLED', 'EXPIRED');
CREATE TABLE "AudioUpload" (
  "id" TEXT NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "AudioUploadStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "AudioUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AudioUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AudioUpload_storageKey_key" ON "AudioUpload"("storageKey");
CREATE INDEX "AudioUpload_status_expiresAt_idx" ON "AudioUpload"("status", "expiresAt");
CREATE INDEX "AudioUpload_ownerId_idx" ON "AudioUpload"("ownerId");
