const assert = require('node:assert/strict');
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { ConflictException, ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { CurrencyCode, EventAttendanceStatus, EventStatus, EventType, MembershipStatus, NotificationChannel, NotificationDeliveryStatus, NotificationType, OrganizationJoinRequestStatus, OrganizationRole, ParticipantInviteStatus, PointsLedgerType, Prisma } = require('@prisma/client');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { EventsService } = require('../dist/events/events.service');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const { OrganizationsService } = require('../dist/organizations/organizations.service');
const { PointsService } = require('../dist/points/points.service');
const { DataEncryptionService } = require('../dist/security/services/data-encryption.service');

class TestConfigService {
  constructor() {
    this.appConfig = {
      app: {
        name: 'saas-platform-api',
        port: 3001,
        nodeEnv: 'test',
        corsOrigin: 'http://localhost:3000',
        corsOrigins: ['http://localhost:3000'],
      },
      database: { url: 'postgresql://test:test@localhost:5432/saas_test?schema=public' },
      redis: { url: 'redis://localhost:6379' },
      jwt: { accessSecret: 'test-access-secret', accessExpiresIn: '15m', refreshSecret: 'test-refresh-secret', refreshExpiresIn: '30d' },
      oauth: { google: { clientId: '', clientSecret: '', callbackUrl: 'http://localhost/google' }, vk: { clientId: '', clientSecret: '', callbackUrl: 'http://localhost/vk' }, yandex: { clientId: '', clientSecret: '', callbackUrl: 'http://localhost/yandex' } },
      firebase: { projectId: '', clientEmail: '', privateKey: '', enabled: false },
      notifications: { reminderOffsetsMinutes: [1440, 60] },
      security: {
        requireHttps: false,
        trustProxy: false,
        requestBodyLimit: '1mb',
        dataEncryptionKey: 'test-data-encryption-key',
        enforceVerifiedOAuthEmail: true,
        cookies: {
          secure: false,
          sameSite: 'lax',
          domain: undefined,
          refreshTokenName: 'saas_refresh_token',
          csrfTokenName: 'saas_csrf_token',
          oauthStateName: 'saas_oauth_state',
        },
        rateLimit: {
          api: { limit: 300, windowMs: 60000 },
          auth: { limit: 10, windowMs: 900000 },
          refresh: { limit: 30, windowMs: 600000 },
          oauth: { limit: 20, windowMs: 600000 },
        },
      },
    };
  }
  get(key) {
    if (key === 'appConfig') return this.appConfig;
    return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), { appConfig: this.appConfig });
  }
}

class FakeNotificationsGateway {
  constructor() { this.emissions = []; }
  emitToUsers(userIds, event, payload) { this.emissions.push({ scope: 'user', target: [...userIds], event, payload }); }
  emitToOrganization(organizationId, event, payload) { this.emissions.push({ scope: 'organization', target: organizationId, event, payload }); }
}

class FakeFirebasePushService {
  isEnabled() { return false; }
  async sendToTokens() { return []; }
}

class InMemoryPrisma {
  constructor() {
    this.state = { users: [], refreshTokens: [], organizations: [], organizationInvites: [], organizationJoinRequests: [], memberships: [], participants: [], participantInvites: [], events: [], eventParticipants: [], participantAvailabilities: [], pointsConfigs: [], pointRateHistories: [], autoPointsComputations: [], pointsLedgerEntries: [], manualPointsAdjustments: [], manualPointsAudits: [], auditLogs: [], notifications: [], notificationRecipients: [], pushDeviceTokens: [] };
    this.user = this.model('user');
    this.refreshToken = this.model('refreshToken');
    this.organization = this.model('organization');
    this.organizationInvite = this.model('organizationInvite');
    this.organizationJoinRequest = this.model('organizationJoinRequest');
    this.membership = this.model('membership');
    this.participant = this.model('participant');
    this.participantInvite = this.model('participantInvite');
    this.event = this.model('event');
    this.eventParticipant = this.model('eventParticipant');
    this.participantAvailability = this.model('participantAvailability');
    this.pointsConfig = this.model('pointsConfig');
    this.pointRateHistory = this.model('pointRateHistory');
    this.pointsLedgerEntry = this.model('pointsLedgerEntry');
    this.autoPointsComputation = this.model('autoPointsComputation');
    this.manualPointsAdjustment = this.model('manualPointsAdjustment');
    this.manualPointsAudit = this.model('manualPointsAudit');
    this.auditLog = this.model('auditLog');
    this.notification = this.model('notification');
    this.notificationRecipient = this.model('notificationRecipient');
    this.pushDeviceToken = this.model('pushDeviceToken');
    this.eventReminderDispatch = this.model('eventReminderDispatch');
  }

  async $connect() {}
  async $disconnect() {}
  async $transaction(input) { return typeof input === 'function' ? input(this) : Promise.all(input); }

  table(name) {
    const map = { user: 'users', refreshToken: 'refreshTokens', organization: 'organizations', organizationInvite: 'organizationInvites', organizationJoinRequest: 'organizationJoinRequests', membership: 'memberships', participant: 'participants', participantInvite: 'participantInvites', event: 'events', eventParticipant: 'eventParticipants', participantAvailability: 'participantAvailabilities', pointsConfig: 'pointsConfigs', pointRateHistory: 'pointRateHistories', pointsLedgerEntry: 'pointsLedgerEntries', autoPointsComputation: 'autoPointsComputations', manualPointsAdjustment: 'manualPointsAdjustments', manualPointsAudit: 'manualPointsAudits', auditLog: 'auditLogs', notification: 'notifications', notificationRecipient: 'notificationRecipients', pushDeviceToken: 'pushDeviceTokens', eventReminderDispatch: 'eventReminderDispatches' };
    const key = map[name];
    if (!key) throw new Error(`Unsupported model ${name}`);
    return this.state[key];
  }

  model(name) {
    return {
      findUnique: async (args) => this.findUnique(name, args && args.where),
      findUniqueOrThrow: async (args) => { const item = this.findUnique(name, args && args.where); if (!item) throw new Error(`${name} not found`); return item; },
      findFirst: async (args = {}) => this.findMany(name, args.where, args.orderBy, args.take)[0] || null,
      findMany: async (args = {}) => this.findMany(name, args.where, args.orderBy, args.take),
      count: async (args = {}) => this.findMany(name, args.where, args.orderBy, args.take).length,
      create: async (args) => this.create(name, args.data),
      createMany: async (args) => ({ count: (args.data || []).map((item) => this.create(name, item)).length }),
      update: async (args) => this.update(name, args.where, args.data),
      updateMany: async (args) => this.updateMany(name, args.where, args.data),
      deleteMany: async (args) => this.deleteMany(name, args.where),
      upsert: async (args) => this.upsert(name, args.where, args.update, args.create),
    };
  }

  defaults(name, data) {
    const now = new Date();
    const base = { id: data.id || randomUUID() };
    const defs = {
      user: { ...base, email: '', passwordHash: null, isEmailVerified: false, firstName: null, lastName: null, avatarUrl: null, phone: null, isActive: true, lastLoginAt: null, createdAt: now, updatedAt: now, deletedAt: null },
      refreshToken: { ...base, userId: null, tokenHash: null, sessionId: null, userAgent: null, ipAddress: null, expiresAt: now, revokedAt: null, createdAt: now, updatedAt: now },
      organization: { ...base, name: '', slug: '', inviteCode: `join${String(base.id).replace(/-/g, '').slice(0, 8)}`, description: null, timezone: 'UTC', settings: null, createdByUserId: null, createdAt: now, updatedAt: now, deletedAt: null },
      organizationInvite: { ...base, organizationId: null, email: null, role: OrganizationRole.MEMBER, status: 'PENDING', tokenHash: randomUUID(), invitedByUserId: null, acceptedByUserId: null, expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), acceptedAt: null, revokedAt: null, createdAt: now, updatedAt: now },
      organizationJoinRequest: { ...base, organizationId: null, userId: null, status: OrganizationJoinRequestStatus.PENDING, message: null, reviewedByUserId: null, reviewedAt: null, createdAt: now, updatedAt: now },
      membership: { ...base, organizationId: null, userId: null, role: OrganizationRole.MEMBER, status: MembershipStatus.INVITED, invitedByUserId: null, invitedAt: now, acceptedAt: null, leftAt: null, suspendedAt: null, createdAt: now, updatedAt: now },
      participant: { ...base, organizationId: null, userId: null, firstName: '', lastName: '', middleName: null, displayName: null, email: null, phone: null, notes: null, invitationStatus: ParticipantInviteStatus.NOT_SENT, invitedAt: null, linkedAt: null, createdByUserId: null, createdAt: now, updatedAt: now, deletedAt: null },
      participantInvite: { ...base, organizationId: null, participantId: null, invitedByUserId: null, email: null, phone: null, status: ParticipantInviteStatus.PENDING, tokenHash: randomUUID(), expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), acceptedAt: null, revokedAt: null, createdAt: now, updatedAt: now },
      event: { ...base, organizationId: null, templateId: null, title: '', description: null, type: EventType.EVENT, status: EventStatus.PLANNED, startsAt: now, endsAt: new Date(now.getTime() + 3600000), durationMinutes: 60, timezone: 'UTC', location: null, isAllDay: false, createdByUserId: null, updatedByUserId: null, createdAt: now, updatedAt: now, deletedAt: null },
      eventParticipant: { ...base, eventId: null, participantId: null, templateRoleId: null, roleName: null, attendanceStatus: EventAttendanceStatus.INVITED, isRequired: true, checkInAt: null, checkOutAt: null, notes: null, createdAt: now, updatedAt: now },
      participantAvailability: { ...base, organizationId: null, participantId: null, startsAt: now, endsAt: new Date(now.getTime() + 3600000), status: 'BUSY', source: 'MANUAL', reason: null, createdByUserId: null, createdAt: now, updatedAt: now },
      pointsConfig: { ...base, organizationId: null, enabled: false, periodStartDay: 25, performanceLongMinutes: 60, performanceLongPoints: new Prisma.Decimal(3), performanceShortPoints: new Prisma.Decimal(2), rehearsalMinutesPerPoint: 180, autoLockDays: 7, pointValue: null, currency: CurrencyCode.RUB, updatedByUserId: null, createdAt: now, updatedAt: now },
      pointRateHistory: { ...base, organizationId: null, effectiveFrom: now, pointValue: new Prisma.Decimal(0), currency: CurrencyCode.RUB, createdByUserId: null, createdAt: now },
      pointsLedgerEntry: { ...base, organizationId: null, participantId: null, eventId: null, eventParticipantId: null, autoComputationId: null, periodStart: now, periodEnd: now, type: PointsLedgerType.AUTO_EVENT, computationStatus: 'CALCULATED', points: new Prisma.Decimal(0), description: null, metadata: null, createdByUserId: null, createdAt: now, updatedAt: now, reversedAt: null },
      autoPointsComputation: { ...base, organizationId: null, eventId: null, runByUserId: null, ruleVersion: 1, status: 'CALCULATED', startedAt: now, finishedAt: null, generatedEntriesCount: 0, generatedPoints: new Prisma.Decimal(0), metadata: null },
      manualPointsAdjustment: { ...base, organizationId: null, ledgerEntryId: null, participantId: null, performedByUserId: null, reason: '', createdAt: now, updatedAt: now, deletedAt: null },
      manualPointsAudit: { ...base, organizationId: null, manualAdjustmentId: null, ledgerEntryId: null, action: 'CREATED', performedByUserId: null, reason: '', oldData: null, newData: null, createdAt: now },
      auditLog: { ...base, organizationId: null, actorUserId: null, targetType: 'SETTINGS', targetId: null, action: '', severity: 'INFO', description: null, ipAddress: null, userAgent: null, requestId: null, payload: null, createdAt: now },
      notification: { ...base, organizationId: null, eventId: null, actorUserId: null, type: NotificationType.SYSTEM, title: '', body: '', payload: null, createdAt: now },
      notificationRecipient: { ...base, notificationId: null, userId: null, channel: NotificationChannel.WEB, status: NotificationDeliveryStatus.PENDING, errorMessage: null, deliveredAt: null, readAt: null, createdAt: now, updatedAt: now },
      pushDeviceToken: { ...base, userId: null, provider: 'FCM', token: '', tokenHash: randomUUID(), platform: null, deviceId: null, isActive: true, lastSeenAt: null, createdAt: now, updatedAt: now },
      eventReminderDispatch: { ...base, eventId: null, reminderKey: '', reminderAt: now, status: NotificationDeliveryStatus.PENDING, errorMessage: null, sentAt: null, createdAt: now },
    };
    const record = defs[name];
    Object.entries(data || {}).forEach(([key, value]) => {
      if (value !== undefined) record[key] = value === Prisma.JsonNull ? null : value;
    });
    return record;
  }

  create(name, data) { const item = this.defaults(name, data || {}); this.table(name).push(item); return this.materialize(name, item); }
  update(name, where, data) { const item = this.rawFindUnique(name, where); if (!item) throw new Error(`Missing ${name}`); Object.entries(data || {}).forEach(([k, v]) => { if (v !== undefined) item[k] = v === Prisma.JsonNull ? null : v; }); if ('updatedAt' in item && !(data && data.updatedAt)) item.updatedAt = new Date(); return this.materialize(name, item); }
  updateMany(name, where, data) { let count = 0; this.table(name).forEach((item) => { if (this.matches(name, item, where)) { Object.entries(data || {}).forEach(([k, v]) => { if (v !== undefined) item[k] = v === Prisma.JsonNull ? null : v; }); if ('updatedAt' in item && !(data && data.updatedAt)) item.updatedAt = new Date(); count += 1; } }); return { count }; }
  deleteMany(name, where) { const table = this.table(name); const kept = table.filter((item) => !this.matches(name, item, where)); const count = table.length - kept.length; table.splice(0, table.length, ...kept); return { count }; }
  upsert(name, where, update, create) { const item = this.rawFindUnique(name, where); return item ? this.update(name, where, update) : this.create(name, create); }
  rawFindUnique(name, where) { return this.table(name).find((item) => this.matchesUnique(name, item, where)) || null; }
  findUnique(name, where) { const item = this.rawFindUnique(name, where); return item ? this.materialize(name, item) : null; }
  findMany(name, where, orderBy, take) { let items = this.table(name).filter((item) => this.matches(name, item, where)); if (orderBy) items = this.sort(items, orderBy); if (typeof take === 'number') items = items.slice(0, take); return items.map((item) => this.materialize(name, item)); }
  matchesUnique(name, item, where) {
    if (!where) return false;
    if (where.id) return item.id === where.id;
    if (name === 'user' && where.email) return item.email === where.email;
    if (name === 'refreshToken' && where.sessionId) return item.sessionId === where.sessionId;
    if (name === 'organizationInvite' && where.tokenHash) return item.tokenHash === where.tokenHash;
    if (name === 'organizationJoinRequest' && where.organizationId_userId) return item.organizationId === where.organizationId_userId.organizationId && item.userId === where.organizationId_userId.userId;
    if (name === 'pushDeviceToken' && where.tokenHash) return item.tokenHash === where.tokenHash;
    if (name === 'membership' && where.organizationId_userId) return item.organizationId === where.organizationId_userId.organizationId && item.userId === where.organizationId_userId.userId;
    if (name === 'pointsConfig' && where.organizationId) return item.organizationId === where.organizationId;
    if (name === 'pointRateHistory' && where.organizationId_effectiveFrom) return item.organizationId === where.organizationId_effectiveFrom.organizationId && this.eq(item.effectiveFrom, where.organizationId_effectiveFrom.effectiveFrom);
    if (name === 'pushDeviceToken' && where.token) return item.token === where.token;
    if (name === 'eventReminderDispatch' && where.eventId_reminderKey) return item.eventId === where.eventId_reminderKey.eventId && item.reminderKey === where.eventId_reminderKey.reminderKey;
    return false;
  }
  matches(name, item, where) {
    if (!where) return true;
    if (where.AND && !where.AND.every((entry) => this.matches(name, item, entry))) return false;
    if (where.OR && !where.OR.some((entry) => this.matches(name, item, entry))) return false;
    for (const [key, cond] of Object.entries(where)) {
      if (key === 'AND' || key === 'OR') continue;
      if (key === 'memberships' && name === 'organization') { const memberships = this.state.memberships.filter((m) => m.organizationId === item.id); if (cond.some && !memberships.some((m) => this.matches('membership', m, cond.some))) return false; continue; }
      if (key === 'organization' && (name === 'membership' || name === 'participant' || name === 'eventParticipant' || name === 'organizationInvite' || name === 'participantInvite')) { const organizationId = name === 'eventParticipant' ? (this.state.events.find((e) => e.id === item.eventId) || {}).organizationId : item.organizationId; const organization = this.state.organizations.find((o) => o.id === organizationId); if (!organization || !this.matches('organization', organization, cond)) return false; continue; }
      if (key === 'user' && name === 'membership') { const user = this.state.users.find((u) => u.id === item.userId); if (!user || !this.matches('user', user, cond)) return false; continue; }
      if (key === 'organization' && name === 'organizationJoinRequest') { const organization = this.state.organizations.find((o) => o.id === item.organizationId); if (!organization || !this.matches('organization', organization, cond)) return false; continue; }
      if (key === 'user' && name === 'organizationJoinRequest') { const user = this.state.users.find((u) => u.id === item.userId); if (!user || !this.matches('user', user, cond)) return false; continue; }
      if (key === 'participant' && name === 'participantInvite') { const participant = this.state.participants.find((p) => p.id === item.participantId); if (!participant || !this.matches('participant', participant, cond)) return false; continue; }
      if (key === 'participant' && name === 'eventParticipant') { const participant = this.state.participants.find((p) => p.id === item.participantId); if (!participant || !this.matches('participant', participant, cond)) return false; continue; }
      if (key === 'event' && name === 'eventParticipant') { const event = this.state.events.find((e) => e.id === item.eventId); if (!event || !this.matches('event', event, cond)) return false; continue; }
      if (key === 'participants' && name === 'event') { const participants = this.state.eventParticipants.filter((p) => p.eventId === item.id); if (cond.some && !participants.some((p) => this.matches('eventParticipant', p, cond.some))) return false; continue; }
      if (key === 'ledgerEntry' && name === 'manualPointsAdjustment') { const entry = this.state.pointsLedgerEntries.find((e) => e.id === item.ledgerEntryId); if (!entry || !this.matches('pointsLedgerEntry', entry, cond)) return false; continue; }
      if (!this.matchesScalar(item[key], cond)) return false;
    }
    return true;
  }
  matchesScalar(value, cond) {
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond) && !(cond instanceof Prisma.Decimal)) {
      if ('in' in cond) return cond.in.some((entry) => this.eq(value, entry));
      if ('notIn' in cond) return !cond.notIn.some((entry) => this.eq(value, entry));
      if ('not' in cond) return !this.matchesScalar(value, cond.not);
      if ('lt' in cond) return this.cmp(value, cond.lt) < 0;
      if ('lte' in cond) return this.cmp(value, cond.lte) <= 0;
      if ('gt' in cond) return this.cmp(value, cond.gt) > 0;
      if ('gte' in cond) return this.cmp(value, cond.gte) >= 0;
      if ('contains' in cond) { const left = String(value || ''); const right = String(cond.contains || ''); return (cond.mode === 'insensitive' ? left.toLowerCase() : left).includes(cond.mode === 'insensitive' ? right.toLowerCase() : right); }
    }
    return this.eq(value, cond);
  }
  cmp(left, right) { const l = left instanceof Date ? left.getTime() : left; const r = right instanceof Date ? right.getTime() : right; return l === r ? 0 : l > r ? 1 : -1; }
  eq(left, right) { if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime(); if (left instanceof Prisma.Decimal || right instanceof Prisma.Decimal) return new Prisma.Decimal(left || 0).eq(new Prisma.Decimal(right || 0)); return left === right; }
  sort(items, orderBy) { const rules = Array.isArray(orderBy) ? orderBy : [orderBy]; return [...items].sort((a, b) => { for (const rule of rules) { const [field, dir] = Object.entries(rule)[0]; const cmp = this.cmp(a[field], b[field]); if (cmp !== 0) return dir === 'desc' ? -cmp : cmp; } return 0; }); }
  materialize(name, item) {
    if (!item) return null;
    if (name === 'membership') return { ...item, organization: this.state.organizations.find((o) => o.id === item.organizationId) || null, user: this.state.users.find((u) => u.id === item.userId) || null };
    if (name === 'organizationInvite') return { ...item, organization: this.state.organizations.find((o) => o.id === item.organizationId) || null };
    if (name === 'organizationJoinRequest') return { ...item, organization: this.state.organizations.find((o) => o.id === item.organizationId) || null, user: this.state.users.find((u) => u.id === item.userId) || null };
    if (name === 'participant') return { ...item, organization: this.state.organizations.find((o) => o.id === item.organizationId) || null };
    if (name === 'participantInvite') return { ...item, organization: this.state.organizations.find((o) => o.id === item.organizationId) || null, participant: this.materialize('participant', this.state.participants.find((p) => p.id === item.participantId) || null) };
    if (name === 'eventParticipant') return { ...item, event: this.state.events.find((e) => e.id === item.eventId) || null, participant: this.materialize('participant', this.state.participants.find((p) => p.id === item.participantId) || null), templateRole: null };
    if (name === 'event') return { ...item, template: null, participants: this.state.eventParticipants.filter((p) => p.eventId === item.id).map((p) => this.materialize('eventParticipant', p)) };
    if (name === 'pointsLedgerEntry') return { ...item, event: item.eventId ? this.state.events.find((e) => e.id === item.eventId) || null : null, participant: this.materialize('participant', this.state.participants.find((p) => p.id === item.participantId) || null) };
    if (name === 'manualPointsAdjustment') return { ...item, ledgerEntry: this.materialize('pointsLedgerEntry', this.state.pointsLedgerEntries.find((e) => e.id === item.ledgerEntryId) || null), participant: this.materialize('participant', this.state.participants.find((p) => p.id === item.participantId) || null) };
    if (name === 'notificationRecipient') return { ...item, notification: this.state.notifications.find((n) => n.id === item.notificationId) || null };
    return { ...item };
  }
}

(async () => {
  const prisma = new InMemoryPrisma();
  const configService = new TestConfigService();
  const jwtService = new JwtService();
  const notificationsGateway = new FakeNotificationsGateway();
  const firebasePushService = new FakeFirebasePushService();
  const dataEncryptionService = new DataEncryptionService(configService);
  const notificationsService = new NotificationsService(
    prisma,
    notificationsGateway,
    firebasePushService,
    dataEncryptionService,
  );
  const authService = new AuthService(prisma, jwtService, configService);
  const organizationsService = new OrganizationsService(prisma, configService, notificationsService);
  const eventsService = new EventsService(prisma, notificationsService);
  const pointsService = new PointsService(prisma);
  const jwtStrategy = new JwtStrategy(configService, prisma);
  const requestMeta = { ipAddress: '127.0.0.1', userAgent: 'scenario-smoke' };
  const results = [];

  const adminAuth = await authService.register({ email: 'admin@example.com', password: 'StrongPass123', firstName: 'Admin', lastName: 'Owner' }, requestMeta);
  const organization = await organizationsService.createOrganization(adminAuth.user.id, { name: 'QA Studio', financeEnabled: true, timezone: 'Europe/Moscow' });
  assert.equal(organization.role, OrganizationRole.ADMIN);
  assert.equal(prisma.state.memberships.some((m) => m.organizationId === organization.id && m.userId === adminAuth.user.id && m.status === MembershipStatus.ACTIVE && m.role === OrganizationRole.ADMIN), true);
  results.push('1. registration -> create organization');

  await jwtStrategy.validate({ sub: adminAuth.user.id, email: adminAuth.user.email, memberships: [], type: 'access' });
  prisma.state.users.find((u) => u.id === adminAuth.user.id).isActive = false;
  await assert.rejects(() => jwtStrategy.validate({ sub: adminAuth.user.id, email: adminAuth.user.email, memberships: [], type: 'access' }), UnauthorizedException);
  prisma.state.users.find((u) => u.id === adminAuth.user.id).isActive = true;
  results.push('security smoke: disabled user JWT rejected');

  const invitedParticipant = await eventsService.createParticipant(organization.id, adminAuth.user.id, { firstName: 'Invited', lastName: 'Member', email: 'member@example.com', sendInvite: true });
  assert.equal(prisma.state.participantInvites.length, 1);
  assert.equal(prisma.state.participantInvites[0].status, ParticipantInviteStatus.PENDING);
  assert.equal(typeof invitedParticipant.inviteToken, 'string');
  const squatterAuth = await authService.register({ email: 'member@example.com', password: 'StrongPass123', firstName: 'Squatter', lastName: 'User' }, requestMeta);
  let linkedParticipant = await eventsService.getParticipant(organization.id, invitedParticipant.id);
  assert.equal(linkedParticipant.userId, null);
  const invitedAuth = await authService.register({ email: 'member@example.com', password: 'RecoveredPass123', firstName: 'Invited', lastName: 'Member', participantInviteToken: invitedParticipant.inviteToken }, requestMeta);
  assert.equal(invitedAuth.user.id, squatterAuth.user.id);
  linkedParticipant = await eventsService.getParticipant(organization.id, invitedParticipant.id);
  assert.equal(linkedParticipant.userId, invitedAuth.user.id);
  assert.equal(linkedParticipant.invitationStatus, ParticipantInviteStatus.ACCEPTED);
  assert.equal(prisma.state.participantInvites[0].status, ParticipantInviteStatus.ACCEPTED);
  assert.equal(prisma.state.users.find((u) => u.id === invitedAuth.user.id).isEmailVerified, true);
  results.push('2. participant invite token reclaims squatted email and links participant safely');

  const directorInvite = await organizationsService.inviteMembership(organization.id, adminAuth.user.id, { email: 'director@example.com', role: OrganizationRole.DIRECTOR });
  assert.equal(typeof directorInvite.inviteToken, 'string');
  assert.equal(typeof directorInvite.inviteLink, 'string');
  const directorInvitePreview = await organizationsService.getInvitationByToken(directorInvite.inviteToken);
  assert.equal(directorInvitePreview.organization.id, organization.id);
  assert.equal(directorInvitePreview.role, OrganizationRole.DIRECTOR);
  const directorAuth = await authService.register({ email: 'director@example.com', password: 'StrongPass123', firstName: 'Dir', lastName: 'Lead', organizationInviteToken: directorInvite.inviteToken }, requestMeta);
  assert.equal(prisma.state.memberships.some((m) => m.organizationId === organization.id && m.userId === directorAuth.user.id && m.role === OrganizationRole.DIRECTOR && m.status === MembershipStatus.ACTIVE), true);
  await assert.rejects(() => organizationsService.inviteMembership(organization.id, directorAuth.user.id, { email: 'newadmin@example.com', role: OrganizationRole.ADMIN }), ForbiddenException);
  results.push('security smoke: organization invite tokens are required and DIRECTOR cannot invite ADMIN');

  const assistantAuth = await authService.register({ email: 'assistant@example.com', password: 'StrongPass123', firstName: 'Assist', lastName: 'User' }, requestMeta);
  const assistantInvite = await organizationsService.inviteMembership(organization.id, adminAuth.user.id, { email: 'assistant@example.com', role: OrganizationRole.ASSISTANT });
  const outgoingInvites = await organizationsService.listOrganizationInvitations(organization.id);
  assert.equal(outgoingInvites.some((invite) => invite.email === 'assistant@example.com' && invite.status === 'PENDING'), true);
  const acceptedMembership = await organizationsService.acceptInvitationByToken(assistantInvite.inviteToken, assistantAuth.user.id);
  assert.equal(acceptedMembership.role, OrganizationRole.ASSISTANT);
  assert.equal(acceptedMembership.status, MembershipStatus.ACTIVE);
  const pendingInvite = await organizationsService.inviteMembership(organization.id, adminAuth.user.id, { email: 'pending@example.com', role: OrganizationRole.MEMBER });
  const revokedInvite = await organizationsService.revokeInvitation(organization.id, pendingInvite.invitationId, adminAuth.user.id);
  assert.equal(revokedInvite.status, 'REVOKED');
  results.push('3. existing user accepts organization invite by raw token and admins can manage outgoing invites');

  const profileInvite = await organizationsService.inviteMembership(organization.id, adminAuth.user.id, { email: 'profile@example.com', role: OrganizationRole.MEMBER });
  const profileAuth = await authService.register({ email: 'profile@example.com', password: 'StrongPass123', firstName: 'Profile', lastName: 'User' }, requestMeta);
  const myInvitations = await organizationsService.listMyInvitations(profileAuth.user.id);
  assert.equal(myInvitations.length, 1);
  const acceptedFromProfile = await organizationsService.acceptMyInvitation(myInvitations[0].invitationId, profileAuth.user.id);
  assert.equal(acceptedFromProfile.status, MembershipStatus.ACTIVE);
  results.push('4. invitation can be accepted from profile by invitation id');

  await assert.rejects(
    () => organizationsService.getJoinByInviteCode(organization.inviteCode),
    ForbiddenException,
  );
  await assert.rejects(
    () =>
      authService.register(
        {
          email: 'joiner@example.com',
          password: 'StrongPass123',
          firstName: 'Join',
          lastName: 'Code',
          organizationJoinCode: organization.inviteCode,
        },
        requestMeta,
      ),
    ForbiddenException,
  );
  const requesterAuth = await authService.register({ email: 'requester@example.com', password: 'StrongPass123', firstName: 'Join', lastName: 'Requester' }, requestMeta);
  await assert.rejects(
    () => organizationsService.createJoinRequest(organization.id, requesterAuth.user.id, { message: 'Хочу участвовать в проектах' }),
    ForbiddenException,
  );
  await assert.rejects(
    () => organizationsService.discoverOrganizations(requesterAuth.user.id, { search: 'QA' }),
    ForbiddenException,
  );
  await assert.rejects(
    () => organizationsService.listOrganizationJoinRequests(organization.id),
    ForbiddenException,
  );
  await assert.rejects(
    () =>
      organizationsService.reviewJoinRequest(
        organization.id,
        randomUUID(),
        adminAuth.user.id,
        { status: 'APPROVED' },
      ),
    ForbiddenException,
  );
  results.push('5. free organization join is disabled and invite-only access is enforced');

  const leaveResult = await organizationsService.leaveOrganization(organization.id, assistantAuth.user.id);
  assert.equal(leaveResult.success, true);
  assert.equal(prisma.state.memberships.find((m) => m.organizationId === organization.id && m.userId === assistantAuth.user.id).status, MembershipStatus.LEFT);
  results.push('7. user can leave organization');

  const previousPeriodEvent = await eventsService.createEvent(organization.id, adminAuth.user.id, { title: 'April 24 Performance', type: EventType.PERFORMANCE, startsAt: '2026-04-24T10:00:00.000Z', endsAt: '2026-04-24T11:00:00.000Z', participants: [{ participantId: invitedParticipant.id, attendanceStatus: EventAttendanceStatus.ACCEPTED, isRequired: true }] });
  const mainEvent = await eventsService.createEvent(organization.id, adminAuth.user.id, { title: 'April 26 Performance', type: EventType.PERFORMANCE, startsAt: '2026-04-26T18:00:00.000Z', endsAt: '2026-04-26T19:30:00.000Z', participants: [{ participantId: invitedParticipant.id, attendanceStatus: EventAttendanceStatus.ACCEPTED, isRequired: true }] });
  assert.equal(prisma.state.notifications.filter((n) => n.type === NotificationType.EVENT_ASSIGNED).length, 2);
  const updatedEvent = await eventsService.updateEvent(organization.id, mainEvent.id, adminAuth.user.id, { title: 'April 26 Performance Updated' });
  assert.equal(updatedEvent.title, 'April 26 Performance Updated');
  assert.equal(prisma.state.notifications.filter((n) => n.type === NotificationType.EVENT_UPDATED && n.eventId === mainEvent.id).length, 1);
  assert.equal(notificationsGateway.emissions.some((item) => item.event === 'notifications:new'), true);
  results.push('8. create/update event -> notifications');

  await assert.rejects(() => eventsService.createEvent(organization.id, adminAuth.user.id, { title: 'Conflict Event', type: EventType.REHEARSAL, startsAt: '2026-04-26T18:30:00.000Z', endsAt: '2026-04-26T20:00:00.000Z', participants: [{ participantId: invitedParticipant.id, attendanceStatus: EventAttendanceStatus.ACCEPTED, isRequired: true }] }), (error) => error instanceof ConflictException);
  results.push('9. overlapping event conflict is detected');

  const pointsConfig = await pointsService.updatePointsConfig(organization.id, adminAuth.user.id, { enabled: true, periodStartDay: 25, pointValue: '100.00', currency: CurrencyCode.RUB });
  assert.equal(pointsConfig.enabled, true);
  assert.equal(pointsConfig.pointValue.toString(), '100');
  const autoPrevious = await pointsService.runAutoPointsForEvent(organization.id, previousPeriodEvent.id, adminAuth.user.id, { forceRecompute: false });
  const autoMain = await pointsService.runAutoPointsForEvent(organization.id, mainEvent.id, adminAuth.user.id, { forceRecompute: false });
  const autoMainReused = await pointsService.runAutoPointsForEvent(organization.id, mainEvent.id, adminAuth.user.id, { forceRecompute: false });
  assert.equal(autoPrevious.reused, false);
  assert.equal(autoMain.pointsPerParticipant, '3.00');
  assert.equal(autoMainReused.reused, true);
  assert.equal(autoMainReused.entriesCount, 1);
  const manualPoints = await pointsService.createManualPoints(organization.id, adminAuth.user.id, { participantId: invitedParticipant.id, points: '1.50', type: PointsLedgerType.BONUS, reason: 'Manual correction', occurredAt: '2026-04-26T12:00:00.000Z' });
  assert.equal(manualPoints.points, '1.50');
  assert.equal(prisma.state.manualPointsAudits.length, 1);
  results.push('10. auto + manual points with audit');

  const currentPeriodSummary = await pointsService.getPeriodSummary(organization.id, { referenceDate: '2026-04-26T12:00:00.000Z', participantId: invitedParticipant.id });
  assert.equal(currentPeriodSummary.periodStart, '2026-04-25T00:00:00.000Z');
  assert.equal(currentPeriodSummary.periodEnd, '2026-05-25T00:00:00.000Z');
  assert.equal(currentPeriodSummary.totals.autoPoints, '3.00');
  assert.equal(currentPeriodSummary.totals.manualPoints, '1.50');
  assert.equal(currentPeriodSummary.totals.totalPoints, '4.50');
  assert.equal(currentPeriodSummary.totals.totalAmount, '450.00');
  const previousPeriodSummary = await pointsService.getPeriodSummary(organization.id, { referenceDate: '2026-04-24T12:00:00.000Z', participantId: invitedParticipant.id });
  assert.equal(previousPeriodSummary.periodStart, '2026-03-25T00:00:00.000Z');
  assert.equal(previousPeriodSummary.periodEnd, '2026-04-25T00:00:00.000Z');
  assert.equal(previousPeriodSummary.totals.totalPoints, '3.00');
  results.push('11. payroll period 25-25');

  console.log('Scenario smoke passed:');
  results.forEach((item) => console.log(`- ${item}`));
})().catch((error) => { console.error('Scenario smoke failed'); console.error(error); process.exitCode = 1; });
