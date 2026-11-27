-- CreateEnum
CREATE TYPE "ArtworkJobState" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "ArtworkArtifact" ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "outputName" TEXT;

-- CreateTable
CREATE TABLE "ArtworkJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "tool" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "inputIds" JSONB NOT NULL,
    "state" "ArtworkJobState" NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "runToken" TEXT,
    "childPid" INTEGER,
    "errorCode" TEXT,
    "result" JSONB,
    "memory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ArtworkJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtworkJob_state_createdAt_idx" ON "ArtworkJob"("state", "createdAt");

-- CreateIndex
CREATE INDEX "ArtworkJob_projectId_createdAt_idx" ON "ArtworkJob"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkJob_id_projectId_key" ON "ArtworkJob"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkJob_projectId_requestKey_key" ON "ArtworkJob"("projectId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkArtifact_jobId_outputName_key" ON "ArtworkArtifact"("jobId", "outputName");

-- AddForeignKey
ALTER TABLE "ArtworkArtifact" ADD CONSTRAINT "ArtworkArtifact_jobId_projectId_fkey" FOREIGN KEY ("jobId", "projectId") REFERENCES "ArtworkJob"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkJob" ADD CONSTRAINT "ArtworkJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtworkProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkJob" ADD CONSTRAINT "ArtworkJob_baseRevisionId_projectId_fkey" FOREIGN KEY ("baseRevisionId", "projectId") REFERENCES "ArtworkRevision"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
