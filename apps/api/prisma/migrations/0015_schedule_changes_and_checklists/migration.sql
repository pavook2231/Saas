ALTER TYPE "NotificationType" ADD VALUE 'EVENT_URGENT_CHANGE';

ALTER TABLE "User"
ADD COLUMN "scheduleChangesSeenAt" TIMESTAMP(3);

ALTER TABLE "Notification"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

CREATE TABLE "EventChecklistItem" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventChecklistItem_eventId_sortOrder_idx" ON "EventChecklistItem"("eventId", "sortOrder");
CREATE INDEX "EventChecklistItem_completedByUserId_updatedAt_idx" ON "EventChecklistItem"("completedByUserId", "updatedAt");

ALTER TABLE "EventChecklistItem"
ADD CONSTRAINT "EventChecklistItem_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventChecklistItem"
ADD CONSTRAINT "EventChecklistItem_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
