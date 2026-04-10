ALTER TABLE "WebPushSubscription"
ADD COLUMN "clientDeviceId" TEXT;

CREATE INDEX "WebPushSubscription_userId_clientDeviceId_isActive_updatedAt_idx"
ON "WebPushSubscription"("userId", "clientDeviceId", "isActive", "updatedAt");
