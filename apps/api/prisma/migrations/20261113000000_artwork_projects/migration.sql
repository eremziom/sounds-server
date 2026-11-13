-- Additive KRE-01 migration: existing application tables/data are preserved.

CREATE TABLE "ArtworkProject" (
    "id" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "activeRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtworkProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtworkRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "restoredFromId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtworkRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtworkArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "registrationId" TEXT,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtworkArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtworkArtifactInput" (
    "artifactId" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ArtworkArtifactInput_pkey" PRIMARY KEY ("artifactId","inputId")
);

CREATE TABLE "CreatorMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" VARCHAR(16000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtworkProject_activeRevisionId_key" ON "ArtworkProject"("activeRevisionId");

CREATE INDEX "ArtworkProject_ownerId_updatedAt_idx" ON "ArtworkProject"("ownerId", "updatedAt");

CREATE UNIQUE INDEX "ArtworkProject_activeRevisionId_id_key" ON "ArtworkProject"("activeRevisionId", "id");

CREATE INDEX "ArtworkRevision_projectId_createdAt_idx" ON "ArtworkRevision"("projectId", "createdAt");

CREATE UNIQUE INDEX "ArtworkRevision_id_projectId_key" ON "ArtworkRevision"("id", "projectId");

CREATE UNIQUE INDEX "ArtworkArtifact_storageKey_key" ON "ArtworkArtifact"("storageKey");

CREATE INDEX "ArtworkArtifact_projectId_createdAt_idx" ON "ArtworkArtifact"("projectId", "createdAt");

CREATE UNIQUE INDEX "ArtworkArtifact_id_projectId_key" ON "ArtworkArtifact"("id", "projectId");

CREATE INDEX "CreatorMessage_projectId_createdAt_idx" ON "CreatorMessage"("projectId", "createdAt");

ALTER TABLE "ArtworkProject" ADD CONSTRAINT "ArtworkProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArtworkProject" ADD CONSTRAINT "ArtworkProject_activeRevisionId_id_fkey" FOREIGN KEY ("activeRevisionId", "id") REFERENCES "ArtworkRevision"("id", "projectId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "ArtworkRevision" ADD CONSTRAINT "ArtworkRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtworkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArtworkRevision" ADD CONSTRAINT "ArtworkRevision_parentId_projectId_fkey" FOREIGN KEY ("parentId", "projectId") REFERENCES "ArtworkRevision"("id", "projectId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "ArtworkRevision" ADD CONSTRAINT "ArtworkRevision_restoredFromId_projectId_fkey" FOREIGN KEY ("restoredFromId", "projectId") REFERENCES "ArtworkRevision"("id", "projectId") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "ArtworkArtifact" ADD CONSTRAINT "ArtworkArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtworkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArtworkArtifactInput" ADD CONSTRAINT "ArtworkArtifactInput_artifactId_projectId_fkey" FOREIGN KEY ("artifactId", "projectId") REFERENCES "ArtworkArtifact"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArtworkArtifactInput" ADD CONSTRAINT "ArtworkArtifactInput_inputId_projectId_fkey" FOREIGN KEY ("inputId", "projectId") REFERENCES "ArtworkArtifact"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreatorMessage" ADD CONSTRAINT "CreatorMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtworkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
