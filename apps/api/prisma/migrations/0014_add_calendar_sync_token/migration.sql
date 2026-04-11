ALTER TABLE "User"
ADD COLUMN "calendarSyncToken" TEXT;

CREATE UNIQUE INDEX "User_calendarSyncToken_key" ON "User"("calendarSyncToken");
