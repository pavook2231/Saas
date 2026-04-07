'use client';

import type { Route } from 'next';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type ConflictCheckResult,
  type EventAttendanceStatus,
  type EventRecord,
  type EventStatus,
  type EventType,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { useToastFeedback } from '@/components/features/use-toast-feedback';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import {
  loadWorkspaceDefaults,
  pushRecentId,
  saveWorkspaceDefaults,
} from '@/components/features/workspace-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const LazyChatPanel = dynamic(() => import('./chat-panel').then((module) => module.ChatPanel), {
  ssr: false,
  loading: () => (
    <div className="resource-empty-inline">
      <strong>Загружаем чат</strong>
      <p>Панель сообщений подключается автоматически.</p>
    </div>
  ),
});

const LazyPointsIncomePanel = dynamic(
  () => import('./points-income-panel').then((module) => module.PointsIncomePanel),
  {
    ssr: false,
    loading: () => (
      <div className="resource-empty-inline">
        <strong>Загружаем баллы</strong>
        <p>Финансовая панель готовится для текущей организации.</p>
      </div>
    ),
  },
);

type ViewMode = 'week' | 'month';
type SidePanel = 'compose' | 'chat' | 'finance';
type ComposerKind = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT';
type BoardColumnKey = 'PERFORMANCE' | 'REHEARSAL' | 'OTHER';

type CalendarEventParticipant = {
  participantId: string;
  templateRoleId?: string;
  roleName?: string;
  attendanceStatus?: EventAttendanceStatus;
  isRequired?: boolean;
  notes?: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  startsAt: Date;
  durationMinutes: number;
  participants: CalendarEventParticipant[];
  templateId: string | null;
  location: string | null;
};

type ComposerState = {
  kind: ComposerKind;
  templateId: string;
  title: string;
  dateInput: string;
  timeInput: string;
  durationMinutes: number;
  participantIds: string[];
};

type LaneSection = {
  key: string;
  label: string;
  items: CalendarEvent[];
};

const boardColumns: Array<{
  key: BoardColumnKey;
  title: string;
  description: string;
  composeKind: ComposerKind;
}> = [
  {
    key: 'PERFORMANCE',
    title: 'Спектакли',
    description: 'Только готовые постановки из шаблонов организации.',
    composeKind: 'PERFORMANCE',
  },
  {
    key: 'REHEARSAL',
    title: 'Репетиции',
    description: 'Все репетиции с временем и составом.',
    composeKind: 'REHEARSAL',
  },
  {
    key: 'OTHER',
    title: 'Прочее',
    description: 'Сборы, встречи и остальные мероприятия.',
    composeKind: 'EVENT',
  },
];

const kindDescriptions: Record<ComposerKind, string> = {
  PERFORMANCE: 'Выберите спектакль из уже заведенных в организации.',
  REHEARSAL: 'Добавьте репетицию, выберите время и состав.',
  EVENT: 'Добавьте любое другое мероприятие без лишних полей.',
};

const kindLabels: Record<ComposerKind, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  EVENT: 'Прочее',
};

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  EVENT: 'Мероприятие',
  CUSTOM: 'Другое',
};

const monthTitleFormat = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
});

const periodDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const sectionDateFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const eventDateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const eventTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const addDays = (date: Date, amount: number): Date => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
};

const addMinutes = (date: Date, amount: number): Date => new Date(date.getTime() + amount * 60_000);

const startOfDay = (date: Date): Date => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfWeek = (date: Date): Date => {
  const clone = startOfDay(date);
  const day = clone.getDay();
  const mondayShift = day === 0 ? -6 : 1 - day;
  return addDays(clone, mondayShift);
};

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeInput = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseDateTimeInput = (dateInput: string, timeInput: string): Date => {
  const [yearRaw, monthRaw, dayRaw] = dateInput.split('-');
  const [hoursRaw, minutesRaw] = timeInput.split(':');

  return new Date(
    Number(yearRaw),
    Number(monthRaw) - 1,
    Number(dayRaw),
    Number(hoursRaw),
    Number(minutesRaw),
    0,
    0,
  );
};

const roundToNextHalfHour = (value: Date): Date => {
  const rounded = new Date(value);
  rounded.setSeconds(0, 0);

  if (rounded.getMinutes() === 0 || rounded.getMinutes() === 30) {
    return rounded;
  }

  if (rounded.getMinutes() < 30) {
    rounded.setMinutes(30, 0, 0);
    return rounded;
  }

  rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  return rounded;
};

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const uniqueIds = (ids: string[]) => ids.filter((value, index, list) => list.indexOf(value) === index);

const toDayKey = (date: Date) => formatDateInput(date);

const getBoardColumnKey = (type: EventType): BoardColumnKey => {
  if (type === 'PERFORMANCE') {
    return 'PERFORMANCE';
  }

  if (type === 'REHEARSAL') {
    return 'REHEARSAL';
  }

  return 'OTHER';
};

const rangeForCursor = (cursorDate: Date, viewMode: ViewMode) => {
  if (viewMode === 'month') {
    const from = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const to = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  const weekStart = startOfWeek(cursorDate);
  const weekEnd = addDays(weekStart, 7);
  return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
};

const mapEventRecordToCalendarEvent = (event: EventRecord): CalendarEvent => ({
  id: event.id,
  title: event.title,
  type: event.type,
  status: event.status,
  startsAt: new Date(event.startsAt),
  durationMinutes: event.durationMinutes,
  participants: event.participants.map((participant) => ({
    participantId: participant.participantId,
    templateRoleId: participant.templateRoleId ?? undefined,
    roleName: participant.roleName ?? undefined,
    attendanceStatus: participant.attendanceStatus,
    isRequired: participant.isRequired,
    notes: participant.notes ?? undefined,
  })),
  templateId: event.templateId,
  location: event.location,
});

const sortEvents = (events: CalendarEvent[]) =>
  [...events].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

const templateParticipantIds = (template: TemplateRecord | null | undefined): string[] => {
  if (!template) {
    return [];
  }

  return uniqueIds(
    template.roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId)),
  );
};

const defaultTitleForKind = (kind: ComposerKind): string => {
  if (kind === 'REHEARSAL') {
    return 'Репетиция';
  }

  if (kind === 'EVENT') {
    return 'Мероприятие';
  }

  return '';
};

const createInitialComposer = (
  organizationId: string | null,
  baseDate = roundToNextHalfHour(new Date()),
): ComposerState => {
  const defaults = loadWorkspaceDefaults(organizationId);
  const lastKind = defaults.lastEventType;
  const normalizedKind: ComposerKind =
    lastKind === 'PERFORMANCE' || lastKind === 'REHEARSAL' || lastKind === 'EVENT'
      ? lastKind
      : 'EVENT';

  return {
    kind: normalizedKind,
    templateId: defaults.recentTemplateIds?.[0] ?? '',
    title: defaultTitleForKind(normalizedKind),
    dateInput: formatDateInput(baseDate),
    timeInput: formatTimeInput(baseDate),
    durationMinutes: defaults.lastEventDurationMinutes ?? 120,
    participantIds: defaults.recentParticipantIds ?? [],
  };
};

const createParticipantsPayload = (
  kind: ComposerKind,
  participantIds: string[],
  template: TemplateRecord | null,
) => {
  if (kind === 'PERFORMANCE' && template) {
    const mapped = template.roles.flatMap((role) =>
      role.assignments
        .filter((assignment) => participantIds.includes(assignment.participantId))
        .map((assignment) => ({
          participantId: assignment.participantId,
          templateRoleId: role.id,
          roleName: role.name,
          isRequired: role.requiredCount > 0,
        })),
    );

    const mappedIds = new Set(mapped.map((item) => item.participantId));
    const extras = participantIds
      .filter((participantId) => !mappedIds.has(participantId))
      .map((participantId) => ({
        participantId,
        isRequired: true,
      }));

    return [...mapped, ...extras];
  }

  return participantIds.map((participantId) => ({
    participantId,
    isRequired: true,
  }));
};

export function CalendarWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canManageEvents =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanel>('compose');
  const [handledComposeKey, setHandledComposeKey] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [recentParticipantIds, setRecentParticipantIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [composer, setComposer] = useState<ComposerState>(() => createInitialComposer(activeOrganizationId));

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Календарь',
    errorTitle: 'Календарь',
  });

  useEffect(() => {
    const defaults = loadWorkspaceDefaults(activeOrganizationId);

    setRecentParticipantIds(defaults.recentParticipantIds ?? []);
    setRecentTemplateIds(defaults.recentTemplateIds ?? []);
    setComposer(createInitialComposer(activeOrganizationId));
    setSelectedEventId(null);
    setConflicts(null);
    setHandledComposeKey('');
    setActiveSidePanel('compose');
    setCursorDate(new Date());
    setErrorText(null);
    setNoticeText(null);
  }, [activeOrganizationId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === composer.templateId) ?? null,
    [composer.templateId, templates],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    if (selectedEventId && !selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEvent, selectedEventId]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return monthTitleFormat.format(cursorDate);
    }

    const weekStart = startOfWeek(cursorDate);
    const weekEnd = addDays(weekStart, 6);
    return `${periodDateFormat.format(weekStart)} — ${periodDateFormat.format(weekEnd)}`;
  }, [cursorDate, viewMode]);

  const loadCalendarData = useCallback(
    async (signal?: AbortSignal) => {
      if (!activeOrganizationId || !accessToken) {
        setEvents([]);
        setTemplates([]);
        setParticipants([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText(null);

      try {
        const { from, to } = rangeForCursor(cursorDate, viewMode);

        const [eventsResponse, templatesResponse, participantsResponse] = await Promise.all([
          operationsApi.listEvents({
            accessToken,
            organizationId: activeOrganizationId,
            from,
            to,
            limit: 400,
            signal,
          }),
          operationsApi.listTemplates({
            accessToken,
            organizationId: activeOrganizationId,
            isActive: true,
            limit: 200,
            signal,
          }),
          operationsApi.listParticipants({
            accessToken,
            organizationId: activeOrganizationId,
            limit: 300,
            signal,
          }),
        ]);

        setEvents(sortEvents(eventsResponse.map(mapEventRecordToCalendarEvent)));
        setTemplates(templatesResponse);
        setParticipants(participantsResponse);
      } catch (error) {
        if ((error as { name?: string } | undefined)?.name === 'AbortError') {
          return;
        }

        setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить календарь.');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [accessToken, activeOrganizationId, cursorDate, viewMode],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadCalendarData(controller.signal);
    return () => controller.abort();
  }, [loadCalendarData]);

  useEffect(() => {
    if (composer.kind !== 'PERFORMANCE' || !selectedTemplate) {
      return;
    }

    const nextParticipantIds = templateParticipantIds(selectedTemplate);

    setComposer((current) => {
      if (current.kind !== 'PERFORMANCE') {
        return current;
      }

      const nextTitle = selectedTemplate.name;
      const nextDuration = selectedTemplate.durationMinutes;
      const shouldUpdateParticipants =
        nextParticipantIds.length > 0 && !sameIds(current.participantIds, nextParticipantIds);

      if (
        current.title === nextTitle &&
        current.durationMinutes === nextDuration &&
        !shouldUpdateParticipants
      ) {
        return current;
      }

      return {
        ...current,
        title: nextTitle,
        durationMinutes: nextDuration,
        participantIds: shouldUpdateParticipants ? nextParticipantIds : current.participantIds,
      };
    });
  }, [composer.kind, selectedTemplate]);

  useEffect(() => {
    if (!canManageEvents) {
      return;
    }

    if (searchParams.get('compose') !== '1') {
      return;
    }

    const composeKey = searchParams.toString();

    if (!composeKey || composeKey === handledComposeKey) {
      return;
    }

    const requestedKind = searchParams.get('kind');
    const nextKind: ComposerKind =
      requestedKind === 'PERFORMANCE' || requestedKind === 'REHEARSAL' || requestedKind === 'EVENT'
        ? requestedKind
        : 'EVENT';

    const requestedDate = searchParams.get('date');
    const requestedTime = searchParams.get('time');
    let baseDate = roundToNextHalfHour(new Date());

    if (requestedDate && requestedTime) {
      const parsed = parseDateTimeInput(requestedDate, requestedTime);

      if (!Number.isNaN(parsed.getTime())) {
        baseDate = parsed;
      }
    }

    const nextComposer = createInitialComposer(activeOrganizationId, baseDate);

    setComposer({
      ...nextComposer,
      kind: nextKind,
      title: nextKind === 'PERFORMANCE' ? '' : defaultTitleForKind(nextKind),
      templateId:
        nextKind === 'PERFORMANCE' ? searchParams.get('templateId')?.trim() ?? nextComposer.templateId : '',
    });
    setActiveSidePanel('compose');
    setConflicts(null);
    setHandledComposeKey(composeKey);

    const nextUrl = pathname || '/calendar';
    router.replace(nextUrl as Route);
  }, [activeOrganizationId, canManageEvents, handledComposeKey, pathname, router, searchParams]);

  const groupedColumns = useMemo(() => {
    const buckets = new Map<
      BoardColumnKey,
      Map<string, LaneSection & { dateValue: number }>
    >();

    for (const column of boardColumns) {
      buckets.set(column.key, new Map());
    }

    for (const event of sortEvents(events)) {
      const columnKey = getBoardColumnKey(event.type);
      const columnBucket = buckets.get(columnKey);

      if (!columnBucket) {
        continue;
      }

      const sectionKey = toDayKey(event.startsAt);
      const dayStart = startOfDay(event.startsAt);

      if (!columnBucket.has(sectionKey)) {
        columnBucket.set(sectionKey, {
          key: sectionKey,
          label: sectionDateFormat.format(event.startsAt),
          items: [],
          dateValue: dayStart.getTime(),
        });
      }

      columnBucket.get(sectionKey)?.items.push(event);
    }

    return boardColumns.map((column) => {
      const sections = [...(buckets.get(column.key)?.values() ?? [])]
        .sort((left, right) => left.dateValue - right.dateValue)
        .map(({ dateValue: _dateValue, ...section }) => section);

      return {
        ...column,
        count: sections.reduce((total, section) => total + section.items.length, 0),
        sections,
      };
    });
  }, [events]);

  const applyKind = useCallback(
    (kind: ComposerKind) => {
      const defaults = loadWorkspaceDefaults(activeOrganizationId);

      setComposer((current) => {
        if (kind === 'PERFORMANCE') {
          const fallbackTemplateId =
            current.templateId || defaults.recentTemplateIds?.[0] || templates[0]?.id || '';
          const fallbackTemplate =
            templates.find((template) => template.id === fallbackTemplateId) ?? templates[0] ?? null;

          return {
            ...current,
            kind,
            templateId: fallbackTemplate?.id ?? '',
            title: fallbackTemplate?.name ?? '',
            durationMinutes:
              fallbackTemplate?.durationMinutes ??
              defaults.lastEventDurationMinutes ??
              current.durationMinutes,
            participantIds:
              fallbackTemplate?.roles.length
                ? templateParticipantIds(fallbackTemplate)
                : current.participantIds,
          };
        }

        return {
          ...current,
          kind,
          templateId: '',
          title: defaultTitleForKind(kind),
          durationMinutes: defaults.lastEventDurationMinutes ?? current.durationMinutes,
        };
      });

      setConflicts(null);
      setActiveSidePanel('compose');
    },
    [activeOrganizationId, templates],
  );

  const openComposerForKind = useCallback(
    (kind: ComposerKind) => {
      applyKind(kind);
      setNoticeText(null);
      setErrorText(null);
    },
    [applyKind],
  );

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId) ?? null;
    const participantIds = templateParticipantIds(template);

    setComposer((current) => ({
      ...current,
      templateId,
      title: template?.name ?? '',
      durationMinutes: template?.durationMinutes ?? current.durationMinutes,
      participantIds: participantIds.length > 0 ? participantIds : current.participantIds,
    }));
    setConflicts(null);
  };

  const handleCursorShift = (direction: 'prev' | 'next') => {
    setCursorDate((current) => {
      if (viewMode === 'month') {
        const next = new Date(current);
        next.setMonth(current.getMonth() + (direction === 'next' ? 1 : -1), 1);
        return next;
      }

      return addDays(current, direction === 'next' ? 7 : -7);
    });
  };

  const runConflictCheck = useCallback(
    async (startsAtIso: string, endsAtIso: string, participantIds: string[]) => {
      if (!activeOrganizationId || !accessToken || participantIds.length === 0) {
        setConflicts(null);
        return null;
      }

      setCheckingConflicts(true);

      try {
        const result = await operationsApi.checkConflicts({
          accessToken,
          organizationId: activeOrganizationId,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          participantIds,
        });

        setConflicts(result);
        return result;
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Не удалось проверить конфликты.');
        return null;
      } finally {
        setCheckingConflicts(false);
      }
    },
    [accessToken, activeOrganizationId],
  );

  const submitComposer = async (ignoreConflicts = false) => {
    if (!activeOrganizationId || !accessToken || !canManageEvents) {
      return;
    }

    setSaving(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      if (!composer.dateInput || !composer.timeInput) {
        throw new Error('Укажите дату и время.');
      }

      if (composer.kind === 'PERFORMANCE' && !composer.templateId) {
        throw new Error('Выберите спектакль из списка.');
      }

      if (composer.kind !== 'PERFORMANCE' && !composer.title.trim()) {
        throw new Error('Укажите название события.');
      }

      if (composer.durationMinutes <= 0) {
        throw new Error('Длительность должна быть больше нуля.');
      }

      const startsAt = parseDateTimeInput(composer.dateInput, composer.timeInput);

      if (Number.isNaN(startsAt.getTime())) {
        throw new Error('Проверьте дату и время.');
      }

      const endsAt = addMinutes(startsAt, composer.durationMinutes);
      const startsAtIso = startsAt.toISOString();
      const endsAtIso = endsAt.toISOString();

      if (!ignoreConflicts) {
        const result = await runConflictCheck(startsAtIso, endsAtIso, composer.participantIds);

        if (result?.hasConflicts) {
          setNoticeText('Нашли пересечения. Проверьте состав или сохраните несмотря на конфликты.');
          return;
        }
      }

      const payload = {
        type: composer.kind,
        title:
          composer.kind === 'PERFORMANCE'
            ? selectedTemplate?.name ?? composer.title.trim()
            : composer.title.trim(),
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        templateId: composer.kind === 'PERFORMANCE' ? composer.templateId : undefined,
        participants: createParticipantsPayload(
          composer.kind,
          composer.participantIds,
          composer.kind === 'PERFORMANCE' ? selectedTemplate : null,
        ),
        ignoreConflicts,
      };

      const created = await operationsApi.createEvent({
        accessToken,
        organizationId: activeOrganizationId,
        payload,
      });

      const createdEvent = mapEventRecordToCalendarEvent(created);
      const defaults = saveWorkspaceDefaults(activeOrganizationId, {
        lastEventType: composer.kind,
        lastEventDurationMinutes: composer.durationMinutes,
        recentParticipantIds: composer.participantIds,
        recentTemplateIds:
          composer.kind === 'PERFORMANCE'
            ? pushRecentId(recentTemplateIds, composer.templateId)
            : recentTemplateIds,
      });

      setEvents((current) => sortEvents([...current, createdEvent]));
      setRecentParticipantIds(defaults.recentParticipantIds ?? []);
      setRecentTemplateIds(defaults.recentTemplateIds ?? []);
      setSelectedEventId(created.id);
      setConflicts(null);
      setNoticeText(
        composer.kind === 'PERFORMANCE'
          ? 'Спектакль добавлен в расписание.'
          : 'Событие добавлено в расписание.',
      );

      const nextBaseDate = addMinutes(startsAt, composer.durationMinutes);
      const nextComposer = createInitialComposer(activeOrganizationId, roundToNextHalfHour(nextBaseDate));
      setComposer({
        ...nextComposer,
        kind: composer.kind,
        title: composer.kind === 'PERFORMANCE' ? '' : defaultTitleForKind(composer.kind),
        templateId: composer.kind === 'PERFORMANCE' ? composer.templateId : '',
        participantIds:
          composer.kind === 'PERFORMANCE'
            ? composer.participantIds
            : defaults.recentParticipantIds ?? [],
        durationMinutes:
          composer.kind === 'PERFORMANCE'
            ? composer.durationMinutes
            : defaults.lastEventDurationMinutes ?? nextComposer.durationMinutes,
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить событие.');
    } finally {
      setSaving(false);
    }
  };

  const recentParticipants = useMemo(
    () =>
      recentParticipantIds
        .map((participantId) => participants.find((participant) => participant.id === participantId))
        .filter((participant): participant is ParticipantRecord => Boolean(participant)),
    [participants, recentParticipantIds],
  );

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <div className="feature-page-header">
          <div className="feature-page-header__copy">
            <p className="feature-page-header__eyebrow">Календарь</p>
            <h1>Расписание организации</h1>
            <p className="feature-page-header__description">
              Сначала нужен активный membership в организации.
            </p>
          </div>
        </div>
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <div className="calendar-page">
        <div className="calendar-shell calendar-shell--premium">
          <header className="calendar-header">
            <div>
              <p className="kicker">Календарь</p>
              <h1>Расписание без лишних шагов</h1>
              <p className="period-label">
                Теперь экран собран по колонкам: спектакли, репетиции и прочие мероприятия.
              </p>
            </div>

            <div className="toolbar">
              <div className="segmented">
                <button
                  type="button"
                  className={viewMode === 'week' ? 'active' : undefined}
                  onClick={() => setViewMode('week')}
                >
                  Неделя
                </button>
                <button
                  type="button"
                  className={viewMode === 'month' ? 'active' : undefined}
                  onClick={() => setViewMode('month')}
                >
                  Месяц
                </button>
              </div>

              <div className="nav-controls">
                <button type="button" onClick={() => handleCursorShift('prev')}>
                  Назад
                </button>
                <button type="button" onClick={() => setCursorDate(new Date())}>
                  Сегодня
                </button>
                <button type="button" onClick={() => handleCursorShift('next')}>
                  Вперед
                </button>
              </div>
            </div>
          </header>

          <div className="calendar-board-toolbar">
            <div className="calendar-board-toolbar__period">
              <strong>{periodLabel}</strong>
              <span>Вся информация остается на одном экране, без сетки с внутренним скроллом.</span>
            </div>

            {canManageEvents ? (
              <Button type="button" onClick={() => openComposerForKind('EVENT')}>
                Добавить событие
              </Button>
            ) : null}
          </div>

          {errorText && !loading ? <p className="finance-error">{errorText}</p> : null}

          {loading ? (
            <div className="calendar-board">
              {boardColumns.map((column) => (
                <article key={column.key} className="calendar-lane">
                  <div className="calendar-lane__header">
                    <div className="ui-skeleton" style={{ height: 22, width: '55%' }} />
                    <div className="ui-skeleton" style={{ height: 14, width: '78%' }} />
                  </div>
                  <div className="calendar-lane__sections">
                    <div className="ui-skeleton" style={{ height: 98 }} />
                    <div className="ui-skeleton" style={{ height: 98 }} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="calendar-board">
              {groupedColumns.map((column) => (
                <article key={column.key} className={`calendar-lane calendar-lane--${column.key.toLowerCase()}`}>
                  <div className="calendar-lane__header">
                    <div className="calendar-lane__header-row">
                      <div>
                        <h2>{column.title}</h2>
                        <p>{column.description}</p>
                      </div>
                      <span className="calendar-lane__count">{column.count}</span>
                    </div>

                    {canManageEvents ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openComposerForKind(column.composeKind)}
                      >
                        Добавить
                      </Button>
                    ) : null}
                  </div>

                  {column.sections.length === 0 ? (
                    <div className="calendar-lane__empty">
                      <strong>Пока пусто</strong>
                      <p>
                        {column.key === 'PERFORMANCE'
                          ? 'Новый спектакль появится здесь после добавления в расписание.'
                          : column.key === 'REHEARSAL'
                            ? 'Добавьте первую репетицию и она сразу появится в этой колонке.'
                            : 'Прочие мероприятия будут собираться в этой колонке.'}
                      </p>
                    </div>
                  ) : (
                    <div className="calendar-lane__sections">
                      {column.sections.map((section) => (
                        <section key={section.key} className="calendar-lane__section">
                          <header className="calendar-lane__section-head">
                            <strong>{section.label}</strong>
                            <span>{section.items.length}</span>
                          </header>

                          <div className="calendar-lane__cards">
                            {section.items.map((event) => (
                              <button
                                key={event.id}
                                type="button"
                                className={[
                                  'schedule-card',
                                  `schedule-card--${getBoardColumnKey(event.type).toLowerCase()}`,
                                  selectedEventId === event.id ? 'is-selected' : '',
                                  event.status === 'CANCELLED' ? 'is-cancelled' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => {
                                  setSelectedEventId(event.id);
                                  setActiveSidePanel('chat');
                                }}
                              >
                                <div className="schedule-card__top">
                                  <span className="schedule-card__type">{eventTypeLabels[event.type]}</span>
                                  <span className="schedule-card__time">
                                    {eventTimeFormat.format(event.startsAt)}
                                  </span>
                                </div>

                                <div className="schedule-card__copy">
                                  <strong>{event.title}</strong>
                                  <p>
                                    {eventDateTimeFormat.format(event.startsAt)} · {event.durationMinutes} мин
                                  </p>
                                </div>

                                <div className="schedule-card__meta">
                                  <span>
                                    {event.participants.length > 0
                                      ? `${event.participants.length} в составе`
                                      : 'Состав не указан'}
                                  </span>
                                  {event.location ? <span>{event.location}</span> : null}
                                  {event.status !== 'PLANNED' ? <span>{event.status}</span> : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="side-stack">
          <div className="side-tabs side-tabs--premium">
            <button
              type="button"
              className={activeSidePanel === 'compose' ? 'is-active' : undefined}
              onClick={() => setActiveSidePanel('compose')}
            >
              Добавить
            </button>
            <button
              type="button"
              className={activeSidePanel === 'chat' ? 'is-active' : undefined}
              onClick={() => setActiveSidePanel('chat')}
            >
              Чат
            </button>
            <button
              type="button"
              className={activeSidePanel === 'finance' ? 'is-active' : undefined}
              onClick={() => setActiveSidePanel('finance')}
            >
              Баллы
            </button>
          </div>

          {activeSidePanel === 'compose' ? (
            <aside className="quick-panel composer-panel">
              <div className="composer-panel__header">
                <div>
                  <h2>Добавить в расписание</h2>
                  <p>Оставили только базовый сценарий: выбрать тип, время и сохранить.</p>
                </div>
                {!canManageEvents ? (
                  <div className="composer-panel__hint">У вас доступ только на просмотр расписания.</div>
                ) : (
                  <div className="composer-panel__hint">{kindDescriptions[composer.kind]}</div>
                )}
              </div>

              <div className="composer-kind-switcher">
                {(['PERFORMANCE', 'REHEARSAL', 'EVENT'] as ComposerKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={composer.kind === kind ? 'is-active' : undefined}
                    onClick={() => applyKind(kind)}
                    disabled={!canManageEvents}
                  >
                    <strong>{kindLabels[kind]}</strong>
                    <span>{kindDescriptions[kind]}</span>
                  </button>
                ))}
              </div>

              {selectedEvent ? (
                <div className="calendar-selected-note">
                  <strong>Выбрано в расписании</strong>
                  <span>
                    {selectedEvent.title} · {eventDateTimeFormat.format(selectedEvent.startsAt)}
                  </span>
                </div>
              ) : null}

              {composer.kind === 'PERFORMANCE' ? (
                <>
                  <Select
                    label="Спектакль"
                    value={composer.templateId}
                    onChange={(event) => handleTemplateChange(event.target.value)}
                    disabled={!canManageEvents}
                  >
                    <option value="">Выберите спектакль</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.durationMinutes} мин
                      </option>
                    ))}
                  </Select>

                  {selectedTemplate ? (
                    <div className="composer-template-preview">
                      <strong>{selectedTemplate.name}</strong>
                      <span>
                        Длительность {selectedTemplate.durationMinutes} мин · ролей{' '}
                        {selectedTemplate.roles.length}
                      </span>
                    </div>
                  ) : (
                    <div className="calendar-selected-note">
                      <strong>Нет выбранного спектакля</strong>
                      <span>Сначала выберите готовый шаблон из организации.</span>
                    </div>
                  )}
                </>
              ) : (
                <Input
                  label="Название"
                  value={composer.title}
                  onChange={(event) => {
                    setComposer((current) => ({ ...current, title: event.target.value }));
                    setConflicts(null);
                  }}
                  disabled={!canManageEvents}
                  placeholder="Например, генеральная репетиция"
                />
              )}

              <div className="resource-form-grid resource-form-grid--double">
                <Input
                  label="Дата"
                  type="date"
                  value={composer.dateInput}
                  onChange={(event) => {
                    setComposer((current) => ({ ...current, dateInput: event.target.value }));
                    setConflicts(null);
                  }}
                  disabled={!canManageEvents}
                />
                <Input
                  label="Время"
                  type="time"
                  value={composer.timeInput}
                  onChange={(event) => {
                    setComposer((current) => ({ ...current, timeInput: event.target.value }));
                    setConflicts(null);
                  }}
                  disabled={!canManageEvents}
                />
              </div>

              <Input
                label="Длительность, минут"
                type="number"
                min={15}
                step={15}
                value={String(composer.durationMinutes)}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);

                  setComposer((current) => ({
                    ...current,
                    durationMinutes: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 0,
                  }));
                  setConflicts(null);
                }}
                disabled={!canManageEvents || composer.kind === 'PERFORMANCE'}
                hint={
                  composer.kind === 'PERFORMANCE'
                    ? 'Для спектакля длительность берется из выбранного шаблона.'
                    : undefined
                }
              />

              {composer.kind === 'PERFORMANCE' && recentTemplateIds.length > 0 ? (
                <div className="resource-inline-actions">
                  <span className="table-muted-copy">Недавние спектакли</span>
                  <div className="quick-choice-row quick-choice-row--wide">
                    {recentTemplateIds
                      .map((templateId) => templates.find((template) => template.id === templateId))
                      .filter((template): template is TemplateRecord => Boolean(template))
                      .map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className="quick-choice-chip"
                          onClick={() => handleTemplateChange(template.id)}
                          disabled={!canManageEvents}
                        >
                          {template.name}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}

              {recentParticipants.length > 0 ? (
                <div className="resource-inline-actions">
                  <span className="table-muted-copy">Недавние участники</span>
                  <div className="quick-choice-row quick-choice-row--wide">
                    {recentParticipants.map((participant) => {
                      const isSelected = composer.participantIds.includes(participant.id);

                      return (
                        <button
                          key={participant.id}
                          type="button"
                          className={['quick-choice-chip', isSelected ? 'is-active' : '']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setComposer((current) => ({
                              ...current,
                              participantIds: isSelected
                                ? current.participantIds.filter((participantId) => participantId !== participant.id)
                                : uniqueIds([...current.participantIds, participant.id]),
                            }));
                            setConflicts(null);
                          }}
                          disabled={!canManageEvents}
                        >
                          {participantDisplayName(participant)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <ParticipantPicker
                participants={participants}
                recentIds={recentParticipantIds}
                value={composer.participantIds}
                onChange={(participantIds) => {
                  setComposer((current) => ({ ...current, participantIds }));
                  setConflicts(null);
                }}
              />

              {conflicts?.hasConflicts ? (
                <div className="composer-conflict-card">
                  <strong>Есть пересечения</strong>
                  <span>
                    Конфликтов по людям: {conflicts.summary.conflictedParticipants}, пересечений по
                    событиям: {conflicts.summary.eventConflicts}.
                  </span>
                  {conflicts.suggestion ? <span>{conflicts.suggestion}</span> : null}
                </div>
              ) : null}

              <div className="composer-panel__actions">
                <Button
                  type="button"
                  loading={saving || checkingConflicts}
                  disabled={!canManageEvents}
                  onClick={() => void submitComposer(false)}
                >
                  {composer.kind === 'PERFORMANCE' ? 'Добавить спектакль' : 'Сохранить в календарь'}
                </Button>

                {conflicts?.hasConflicts ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!canManageEvents || saving}
                    onClick={() => void submitComposer(true)}
                  >
                    Создать несмотря на конфликты
                  </Button>
                ) : null}
              </div>
            </aside>
          ) : null}

          {activeSidePanel === 'chat' ? (
            <LazyChatPanel
              organizationId={activeOrganizationId}
              accessToken={accessToken}
              defaultScope={selectedEvent ? 'EVENT' : 'ORGANIZATION'}
              defaultEventId={selectedEvent?.id ?? null}
              lockWorkspace
            />
          ) : null}

          {activeSidePanel === 'finance' ? (
            <LazyPointsIncomePanel
              organizationId={activeOrganizationId}
              accessToken={accessToken}
              lockWorkspace
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
