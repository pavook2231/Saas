ALTER TABLE "Event"
ADD COLUMN "performanceCastNumber" INTEGER,
ADD COLUMN "performanceCastLocked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Event_templateId_startsAt_performanceCastNumber_idx"
ON "Event"("templateId", "startsAt", "performanceCastNumber");
