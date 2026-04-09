CREATE TYPE "EmailAuthCodePurpose" AS ENUM ('LOGIN', 'REGISTER', 'PASSWORD_RESET');

CREATE TABLE "EmailAuthCode" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "purpose" "EmailAuthCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAuthCode_email_purpose_expiresAt_consumedAt_idx"
ON "EmailAuthCode"("email", "purpose", "expiresAt", "consumedAt");

CREATE INDEX "EmailAuthCode_userId_purpose_createdAt_idx"
ON "EmailAuthCode"("userId", "purpose", "createdAt");

ALTER TABLE "EmailAuthCode"
ADD CONSTRAINT "EmailAuthCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
