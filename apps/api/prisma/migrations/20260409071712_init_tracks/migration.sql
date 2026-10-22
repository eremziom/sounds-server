-- CreateTable
CREATE TABLE "Track" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "bpmFrom" INTEGER NOT NULL,
    "bpmTo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);
