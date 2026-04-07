ALTER TABLE "Organization" ADD COLUMN "inviteCode" TEXT;

UPDATE "Organization"
SET "inviteCode" = lower(substr(replace("id"::text, '-', ''), 1, 12))
WHERE "inviteCode" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "inviteCode" SET NOT NULL;

CREATE UNIQUE INDEX "Organization_inviteCode_key" ON "Organization"("inviteCode");
