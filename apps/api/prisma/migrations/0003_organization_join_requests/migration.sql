CREATE TYPE "OrganizationJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "OrganizationJoinRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "OrganizationJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationJoinRequest_organizationId_userId_key" ON "OrganizationJoinRequest"("organizationId", "userId");
CREATE INDEX "OrganizationJoinRequest_organizationId_status_createdAt_idx" ON "OrganizationJoinRequest"("organizationId", "status", "createdAt");
CREATE INDEX "OrganizationJoinRequest_userId_status_createdAt_idx" ON "OrganizationJoinRequest"("userId", "status", "createdAt");

ALTER TABLE "OrganizationJoinRequest"
ADD CONSTRAINT "OrganizationJoinRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationJoinRequest"
ADD CONSTRAINT "OrganizationJoinRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationJoinRequest"
ADD CONSTRAINT "OrganizationJoinRequest_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
