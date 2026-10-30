CREATE TABLE "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "AuthRateLimit_resetAt_idx" ON "AuthRateLimit"("resetAt");
