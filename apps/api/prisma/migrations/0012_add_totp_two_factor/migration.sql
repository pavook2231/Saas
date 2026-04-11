ALTER TABLE "User"
ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpPendingSecret" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
