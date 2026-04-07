'use client';

import type { EventType } from '@/app/lib/api/operations';

type WorkspaceDefaults = {
  lastEventType?: EventType;
  lastEventDurationMinutes?: number;
  lastEventLocation?: string;
  recentParticipantIds?: string[];
  recentTemplateIds?: string[];
};

const MAX_RECENT_IDS = 8;

const storageKey = (organizationId: string) => `saas.workspace.defaults.${organizationId}`;

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const sanitizeIds = (value: string[] | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, MAX_RECENT_IDS);
};

export const loadWorkspaceDefaults = (organizationId: string | null | undefined): WorkspaceDefaults => {
  if (!organizationId || !canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as WorkspaceDefaults;

    return {
      lastEventType: parsed.lastEventType,
      lastEventDurationMinutes:
        typeof parsed.lastEventDurationMinutes === 'number'
          ? parsed.lastEventDurationMinutes
          : undefined,
      lastEventLocation: parsed.lastEventLocation?.trim() || undefined,
      recentParticipantIds: sanitizeIds(parsed.recentParticipantIds),
      recentTemplateIds: sanitizeIds(parsed.recentTemplateIds),
    };
  } catch {
    return {};
  }
};

export const saveWorkspaceDefaults = (
  organizationId: string | null | undefined,
  patch: Partial<WorkspaceDefaults>,
): WorkspaceDefaults => {
  if (!organizationId || !canUseStorage()) {
    return {};
  }

  const current = loadWorkspaceDefaults(organizationId);
  const next: WorkspaceDefaults = {
    ...current,
    ...patch,
    lastEventLocation:
      patch.lastEventLocation !== undefined
        ? patch.lastEventLocation.trim() || undefined
        : current.lastEventLocation,
    recentParticipantIds:
      patch.recentParticipantIds !== undefined
        ? sanitizeIds(patch.recentParticipantIds)
        : current.recentParticipantIds,
    recentTemplateIds:
      patch.recentTemplateIds !== undefined
        ? sanitizeIds(patch.recentTemplateIds)
        : current.recentTemplateIds,
  };

  window.localStorage.setItem(storageKey(organizationId), JSON.stringify(next));
  return next;
};

export const pushRecentId = (current: string[] | undefined, value: string | null | undefined) => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return sanitizeIds(current);
  }

  return sanitizeIds([normalizedValue, ...(current ?? [])]);
};
