-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('ADMIN', 'DIRECTOR', 'ASSISTANT', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrganizationInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'VK', 'YANDEX');

-- CreateEnum
CREATE TYPE "OAuthAccountStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "OauthStateAction" AS ENUM ('LOGIN', 'LINK');

-- CreateEnum
CREATE TYPE "ParticipantInviteStatus" AS ENUM ('NOT_SENT', 'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PERFORMANCE', 'REHEARSAL', 'EVENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventAttendanceStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'ATTENDED', 'ABSENT');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'TENTATIVE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('MANUAL', 'EVENT', 'IMPORTED');

-- CreateEnum
CREATE TYPE "PointsLedgerType" AS ENUM ('AUTO_EVENT', 'MANUAL_ADJUSTMENT', 'CORRECTION', 'BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "PointsComputationStatus" AS ENUM ('PENDING', 'CALCULATED', 'LOCKED', 'VOID');

-- CreateEnum
CREATE TYPE "ManualPointsAuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EVENT_ASSIGNED', 'EVENT_UPDATED', 'EVENT_REMINDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WEB', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "ChatScope" AS ENUM ('ORGANIZATION', 'EVENT');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('FCM');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('ORGANIZATION', 'MEMBERSHIP', 'PARTICIPANT', 'EVENT', 'TEMPLATE', 'POINTS', 'MANUAL_POINTS', 'NOTIFICATION', 'CHAT', 'AUTH', 'SETTINGS');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "tokenType" TEXT,
    "scopes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "OAuthAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OauthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthState" (
    "id" UUID NOT NULL,
    "nonce" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "action" "OauthStateAction" NOT NULL,
    "linkUserId" UUID,
    "clientState" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OauthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "settings" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invitedByUserId" UUID,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvite" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "status" "OrganizationInviteStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID,
    "acceptedByUserId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "invitationStatus" "ParticipantInviteStatus" NOT NULL DEFAULT 'NOT_SENT',
    "invitedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantInvite" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "invitedByUserId" UUID,
    "email" TEXT,
    "phone" TEXT,
    "status" "ParticipantInviteStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRole" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRoleAssignment" (
    "id" UUID NOT NULL,
    "templateRoleId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'EVENT',
    "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "location" TEXT,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "templateRoleId" UUID,
    "roleName" TEXT,
    "attendanceStatus" "EventAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantAvailability" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'BUSY',
    "source" "AvailabilitySource" NOT NULL DEFAULT 'MANUAL',
    "reason" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsConfig" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "periodStartDay" INTEGER NOT NULL DEFAULT 25,
    "performanceLongMinutes" INTEGER NOT NULL DEFAULT 60,
    "performanceLongPoints" DECIMAL(12,2) NOT NULL DEFAULT 3,
    "performanceShortPoints" DECIMAL(12,2) NOT NULL DEFAULT 2,
    "rehearsalMinutesPerPoint" INTEGER NOT NULL DEFAULT 180,
    "autoLockDays" INTEGER NOT NULL DEFAULT 7,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoPointsComputation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "runByUserId" UUID,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "PointsComputationStatus" NOT NULL DEFAULT 'CALCULATED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "generatedEntriesCount" INTEGER NOT NULL DEFAULT 0,
    "generatedPoints" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "AutoPointsComputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedgerEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "eventId" UUID,
    "eventParticipantId" UUID,
    "autoComputationId" UUID,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "type" "PointsLedgerType" NOT NULL,
    "computationStatus" "PointsComputationStatus" NOT NULL DEFAULT 'CALCULATED',
    "points" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "PointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPointsAdjustment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ledgerEntryId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "performedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ManualPointsAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPointsAudit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "manualAdjustmentId" UUID NOT NULL,
    "ledgerEntryId" UUID NOT NULL,
    "action" "ManualPointsAuditAction" NOT NULL,
    "performedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPointsAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT,
    "action" TEXT NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "description" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "eventId" UUID,
    "actorUserId" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "PushProvider" NOT NULL DEFAULT 'FCM',
    "token" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "platform" TEXT,
    "deviceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EventReminderDispatch" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3) NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID,
    "senderUserId" UUID NOT NULL,
    "scope" "ChatScope" NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "OauthAccount_userId_idx" ON "OauthAccount"("userId");

-- CreateIndex
CREATE INDEX "OauthAccount_provider_email_idx" ON "OauthAccount"("provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccount_provider_providerUserId_key" ON "OauthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccount_userId_provider_key" ON "OauthAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OauthState_nonce_key" ON "OauthState"("nonce");

-- CreateIndex
CREATE INDEX "OauthState_provider_action_expiresAt_consumedAt_idx" ON "OauthState"("provider", "action", "expiresAt", "consumedAt");

-- CreateIndex
CREATE INDEX "OauthState_linkUserId_createdAt_idx" ON "OauthState"("linkUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_sessionId_key" ON "RefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_createdByUserId_idx" ON "Organization"("createdByUserId");

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_status_idx" ON "Membership"("organizationId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvite_tokenHash_key" ON "OrganizationInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_status_expiresAt_idx" ON "OrganizationInvite"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_email_idx" ON "OrganizationInvite"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Participant_organizationId_lastName_firstName_idx" ON "Participant"("organizationId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Participant_organizationId_email_idx" ON "Participant"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Participant_organizationId_deletedAt_idx" ON "Participant"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_organizationId_userId_key" ON "Participant"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantInvite_tokenHash_key" ON "ParticipantInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ParticipantInvite_organizationId_status_expiresAt_idx" ON "ParticipantInvite"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ParticipantInvite_participantId_status_idx" ON "ParticipantInvite"("participantId", "status");

-- CreateIndex
CREATE INDEX "ParticipantInvite_email_idx" ON "ParticipantInvite"("email");

-- CreateIndex
CREATE INDEX "Template_organizationId_isActive_idx" ON "Template"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Template_organizationId_deletedAt_idx" ON "Template"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "TemplateRole_templateId_sortOrder_idx" ON "TemplateRole"("templateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRole_templateId_name_key" ON "TemplateRole"("templateId", "name");

-- CreateIndex
CREATE INDEX "TemplateRoleAssignment_participantId_idx" ON "TemplateRoleAssignment"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRoleAssignment_templateRoleId_participantId_key" ON "TemplateRoleAssignment"("templateRoleId", "participantId");

-- CreateIndex
CREATE INDEX "Event_organizationId_startsAt_idx" ON "Event"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_organizationId_status_startsAt_idx" ON "Event"("organizationId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_organizationId_deletedAt_idx" ON "Event"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Event_templateId_idx" ON "Event"("templateId");

-- CreateIndex
CREATE INDEX "EventParticipant_participantId_attendanceStatus_idx" ON "EventParticipant"("participantId", "attendanceStatus");

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_attendanceStatus_idx" ON "EventParticipant"("eventId", "attendanceStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_participantId_key" ON "EventParticipant"("eventId", "participantId");

-- CreateIndex
CREATE INDEX "ParticipantAvailability_organizationId_startsAt_endsAt_idx" ON "ParticipantAvailability"("organizationId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ParticipantAvailability_participantId_startsAt_endsAt_idx" ON "ParticipantAvailability"("participantId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointsConfig_organizationId_key" ON "PointsConfig"("organizationId");

-- CreateIndex
CREATE INDEX "AutoPointsComputation_organizationId_eventId_startedAt_idx" ON "AutoPointsComputation"("organizationId", "eventId", "startedAt");

-- CreateIndex
CREATE INDEX "AutoPointsComputation_status_idx" ON "AutoPointsComputation"("status");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_organizationId_periodStart_periodEnd_idx" ON "PointsLedgerEntry"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_participantId_periodStart_idx" ON "PointsLedgerEntry"("participantId", "periodStart");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_eventId_type_idx" ON "PointsLedgerEntry"("eventId", "type");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_eventParticipantId_idx" ON "PointsLedgerEntry"("eventParticipantId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_autoComputationId_idx" ON "PointsLedgerEntry"("autoComputationId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_organizationId_type_createdAt_idx" ON "PointsLedgerEntry"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPointsAdjustment_ledgerEntryId_key" ON "ManualPointsAdjustment"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "ManualPointsAdjustment_organizationId_participantId_created_idx" ON "ManualPointsAdjustment"("organizationId", "participantId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPointsAdjustment_performedByUserId_createdAt_idx" ON "ManualPointsAdjustment"("performedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPointsAudit_organizationId_createdAt_idx" ON "ManualPointsAudit"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPointsAudit_manualAdjustmentId_createdAt_idx" ON "ManualPointsAudit"("manualAdjustmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPointsAudit_ledgerEntryId_idx" ON "ManualPointsAudit"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_eventId_createdAt_idx" ON "Notification"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_channel_status_createdAt_idx" ON "NotificationRecipient"("userId", "channel", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_channel_key" ON "NotificationRecipient"("notificationId", "userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushDeviceToken_tokenHash_key" ON "PushDeviceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PushDeviceToken_userId_isActive_updatedAt_idx" ON "PushDeviceToken"("userId", "isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "SecurityRateLimit_resetAt_idx" ON "SecurityRateLimit"("resetAt");

-- CreateIndex
CREATE INDEX "EventReminderDispatch_reminderAt_sentAt_idx" ON "EventReminderDispatch"("reminderAt", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminderDispatch_eventId_reminderKey_key" ON "EventReminderDispatch"("eventId", "reminderKey");

-- CreateIndex
CREATE INDEX "ChatMessage_organizationId_scope_createdAt_idx" ON "ChatMessage"("organizationId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_eventId_createdAt_idx" ON "ChatMessage"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderUserId_createdAt_idx" ON "ChatMessage"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_organizationId_deletedAt_createdAt_idx" ON "ChatMessage"("organizationId", "deletedAt", "createdAt");

-- CreateIndex
ALTER TABLE "OauthAccount" ADD CONSTRAINT "OauthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthState" ADD CONSTRAINT "OauthState_linkUserId_fkey" FOREIGN KEY ("linkUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantInvite" ADD CONSTRAINT "ParticipantInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantInvite" ADD CONSTRAINT "ParticipantInvite_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantInvite" ADD CONSTRAINT "ParticipantInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRole" ADD CONSTRAINT "TemplateRole_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRoleAssignment" ADD CONSTRAINT "TemplateRoleAssignment_templateRoleId_fkey" FOREIGN KEY ("templateRoleId") REFERENCES "TemplateRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRoleAssignment" ADD CONSTRAINT "TemplateRoleAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_templateRoleId_fkey" FOREIGN KEY ("templateRoleId") REFERENCES "TemplateRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAvailability" ADD CONSTRAINT "ParticipantAvailability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAvailability" ADD CONSTRAINT "ParticipantAvailability_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantAvailability" ADD CONSTRAINT "ParticipantAvailability_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsConfig" ADD CONSTRAINT "PointsConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsConfig" ADD CONSTRAINT "PointsConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPointsComputation" ADD CONSTRAINT "AutoPointsComputation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPointsComputation" ADD CONSTRAINT "AutoPointsComputation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPointsComputation" ADD CONSTRAINT "AutoPointsComputation_runByUserId_fkey" FOREIGN KEY ("runByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_eventParticipantId_fkey" FOREIGN KEY ("eventParticipantId") REFERENCES "EventParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_autoComputationId_fkey" FOREIGN KEY ("autoComputationId") REFERENCES "AutoPointsComputation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAdjustment" ADD CONSTRAINT "ManualPointsAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAdjustment" ADD CONSTRAINT "ManualPointsAdjustment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "PointsLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAdjustment" ADD CONSTRAINT "ManualPointsAdjustment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAdjustment" ADD CONSTRAINT "ManualPointsAdjustment_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAudit" ADD CONSTRAINT "ManualPointsAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAudit" ADD CONSTRAINT "ManualPointsAudit_manualAdjustmentId_fkey" FOREIGN KEY ("manualAdjustmentId") REFERENCES "ManualPointsAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAudit" ADD CONSTRAINT "ManualPointsAudit_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "PointsLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPointsAudit" ADD CONSTRAINT "ManualPointsAudit_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderDispatch" ADD CONSTRAINT "EventReminderDispatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

