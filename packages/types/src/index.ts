export type UUID = string;

export enum OrganizationRole {
  ADMIN = 'ADMIN',
  DIRECTOR = 'DIRECTOR',
  ASSISTANT = 'ASSISTANT',
  MEMBER = 'MEMBER',
}

export enum EventType {
  PERFORMANCE = 'PERFORMANCE',
  REHEARSAL = 'REHEARSAL',
  EVENT = 'EVENT',
  CUSTOM = 'CUSTOM',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PointsLedgerType {
  AUTO_EVENT = 'AUTO_EVENT',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

export type AccountingPeriod = {
  startAt: Date;
  endAt: Date;
};

export type JwtPayload = {
  sub: UUID;
  email: string;
  memberships: Array<{
    organizationId: UUID;
    role: OrganizationRole;
  }>;
};

export type ManualPointsCommand = {
  organizationId: UUID;
  participantId: UUID;
  points: number;
  description: string;
};
