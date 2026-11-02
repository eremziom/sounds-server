-- Existing tracks retain their data and have no owner or audio file.
ALTER TABLE "Track" ADD COLUMN "ownerId" INTEGER;

CREATE TABLE "AudioFile" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Track_ownerId_idx" ON "Track"("ownerId");
CREATE UNIQUE INDEX "AudioFile_trackId_key" ON "AudioFile"("trackId");
CREATE UNIQUE INDEX "AudioFile_storageKey_key" ON "AudioFile"("storageKey");

ALTER TABLE "Track" ADD CONSTRAINT "Track_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AudioFile" ADD CONSTRAINT "AudioFile_trackId_fkey"
    FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
