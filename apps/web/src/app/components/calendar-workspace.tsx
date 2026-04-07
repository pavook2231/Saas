'use client';

import type { Route } from 'next';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type DragEvent, useCallback, useEffect, useMemo, useState } from 'react';

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
  type UpdateEventPayload,
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

import { ru } from '../lib/i18n/ru';

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
  description: string | null;
  location: string | null;
  timezone: string | null;
  isAllDay: boolean;
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

const weekDayLabels = ru.calendar.weekDayLabels;
const weekHours = Array.from({ length: 14 }, (_, index) => index + 8);
const durationPresets = [60, 90, 120, 180];
const kindLabels: Record<ComposerKind, string> = {
  PERFORMANCE: ru.calendar.composer.types.performance,
  REHEARSAL: ru.calendar.composer.types.rehearsal,
  EVENT: ru.calendar.composer.types.event,
};
const eventTypeLabels: Record<EventType, string> = ru.calendar.eventTypeLabels;

const monthTitleFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const weekdayLongFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const shortDateFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short', day: 'numeric' });

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

const startOfMonthGrid = (date: Date): Date => {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(monthStart);
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

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const toDayKey = (date: Date): string => formatDateInput(date);

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

const rangeForCursor = (cursorDate: Date, viewMode: ViewMode) => {
  if (viewMode === 'month') {
    const gridStart = startOfMonthGrid(cursorDate);
    const gridEnd = addDays(gridStart, 42);
    return { from: addDays(gridStart, -7).toISOString(), to: addDays(gridEnd, 7).toISOString() };
  }

  const weekStart = startOfWeek(cursorDate);
  const weekEnd = addDays(weekStart, 7);
  return { from: addDays(weekStart, -14).toISOString(), to: addDays(weekEnd, 21).toISOString() };
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
  description: event.description,
  location: event.location,
  timezone: event.timezone,
  isAllDay: event.isAllDay,
});

const toUpdatePayload = (event: CalendarEvent): UpdateEventPayload => ({
  title: event.title,
  description: event.description ?? undefined,
  type: event.type,
  status: event.status,
  startsAt: event.startsAt.toISOString(),
  endsAt: addMinutes(event.startsAt, event.durationMinutes).toISOString(),
  timezone: event.timezone ?? undefined,
  location: event.location ?? undefined,
  isAllDay: event.isAllDay,
  templateId: event.templateId,
  participants: event.participants.map((participant) => ({
    participantId: participant.participantId,
    templateRoleId: participant.templateRoleId,
    roleName: participant.roleName,
    attendanceStatus: participant.attendanceStatus,
    isRequired: participant.isRequired,
    notes: participant.notes,
  })),
});

const moveEventToDay = (event: CalendarEvent, targetDay: Date): CalendarEvent => {
  const next = new Date(targetDay);
  next.setHours(event.startsAt.getHours(), event.startsAt.getMinutes(), 0, 0);
  return { ...event, startsAt: next };
};

const moveEventToWeekSlot = (event: CalendarEvent, targetDay: Date, hour: number): CalendarEvent => {
  const next = new Date(targetDay);
  next.setHours(hour, 0, 0, 0);
  return { ...event, startsAt: next };
};

const uniqueIds = (ids: string[]) => ids.filter((value, index, list) => list.indexOf(value) === index);

const templateParticipantIds = (template: TemplateRecord | null | undefined): string[] => {
  if (!template) {
    return [];
  }

  return uniqueIds(template.roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId)));
};

const createInitialComposer = (
  organizationId: string | null,
  baseDate = roundToNextHalfHour(new Date()),
): ComposerState => {
  const defaults = loadWorkspaceDefaults(organizationId);

  return {
    kind: (defaults.lastEventType as ComposerKind | undefined) ?? 'EVENT',
    templateId: defaults.recentTemplateIds?.[0] ?? '',
    title: '',
    dateInput: formatDateInput(baseDate),
    timeInput: formatTimeInput(baseDate),
    durationMinutes: defaults.lastEventDurationMinutes ?? 120,
    participantIds: defaults.recentParticipantIds ?? [],
  };
};

export function CalendarWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanel>('compose');
  const [composer, setComposer] = useState<ComposerState>(() => createInitialComposer(null));
  const [handledComposeKey, setHandledComposeKey] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  useToastFeedback({ noticeText, errorText, noticeTitle: 'Календарь', errorTitle: 'Календарь' });

  const loadCalendarData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setEvents([]);
      setTemplates([]);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const range = rangeForCursor(cursorDate, viewMode);
      const [eventsResponse, templatesResponse, participantsResponse] = await Promise.all([
        operationsApi.listEvents({ organizationId: activeOrganizationId, accessToken, from: range.from, to: range.to, limit: 300 }),
        operationsApi.listTemplates({ organizationId: activeOrganizationId, accessToken, limit: 100, isActive: true }),
        operationsApi.listParticipants({ organizationId: activeOrganizationId, accessToken, limit: 300 }),
      ]);

      setEvents(eventsResponse.map(mapEventRecordToCalendarEvent));
      setTemplates(templatesResponse);
      setParticipants(participantsResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, cursorDate, viewMode]);

  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData]);

  useEffect(() => {
    setComposer(createInitialComposer(activeOrganizationId));
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    if (!events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const templatesById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const selectedTemplate = composer.templateId ? templatesById.get(composer.templateId) ?? null : null;

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
    [events],
  );

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursorDate]);

  const monthDays = useMemo(() => {
    const start = startOfMonthGrid(cursorDate);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursorDate]);

  const monthEventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const event of sortedEvents) {
      const key = toDayKey(event.startsAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }

    return map;
  }, [sortedEvents]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return monthTitleFormat.format(cursorDate);
    }

    const start = weekDays[0];
    const end = weekDays[weekDays.length - 1];
    return `${shortDateFormat.format(start)} - ${shortDateFormat.format(end)}`;
  }, [cursorDate, viewMode, weekDays]);

  const recentDefaults = useMemo(() => loadWorkspaceDefaults(activeOrganizationId), [activeOrganizationId, events.length]);

  const recentTemplateCards = useMemo(
    () =>
      (recentDefaults.recentTemplateIds ?? [])
        .map((templateId) => templatesById.get(templateId) ?? null)
        .filter((template): template is TemplateRecord => template !== null),
    [recentDefaults.recentTemplateIds, templatesById],
  );

  const recentParticipants = useMemo(() => {
    const byId = new Map(participants.map((participant) => [participant.id, participant]));
    return (recentDefaults.recentParticipantIds ?? [])
      .map((participantId) => byId.get(participantId) ?? null)
      .filter((participant): participant is ParticipantRecord => participant !== null);
  }, [participants, recentDefaults.recentParticipantIds]);

  const hydrateComposerFromTemplate = useCallback(
    (templateId: string, baseState?: ComposerState): ComposerState => {
      const template = templatesById.get(templateId) ?? null;
      const nextState = baseState ?? composer;

      if (!template) {
        return { ...nextState, kind: 'PERFORMANCE', templateId };
      }

      return {
        ...nextState,
        kind: 'PERFORMANCE',
        templateId: template.id,
        title: template.name,
        durationMinutes: template.durationMinutes,
        participantIds: templateParticipantIds(template),
      };
    },
    [composer, templatesById],
  );

  const openComposerAt = useCallback(
    (baseDate: Date, nextKind?: ComposerKind) => {
      setActiveSidePanel('compose');
      setCursorDate(startOfDay(baseDate));
      setComposer((current) => {
        const nextBase = {
          ...current,
          dateInput: formatDateInput(baseDate),
          timeInput: formatTimeInput(baseDate),
          kind: nextKind ?? current.kind,
        };

        if ((nextKind ?? current.kind) === 'PERFORMANCE' && nextBase.templateId) {
          return hydrateComposerFromTemplate(nextBase.templateId, nextBase);
        }

        return nextBase;
      });
    },
    [hydrateComposerFromTemplate],
  );

  useEffect(() => {
    if (!activeOrganizationId) {
      return;
    }

    const composeRequested = searchParams.get('compose') === '1';
    const templateId = searchParams.get('templateId');
    const kind = (searchParams.get('kind') as ComposerKind | null) ?? null;
    const dateInput = searchParams.get('date');
    const timeInput = searchParams.get('time');

    const composeKey = composeRequested
      ? `${activeOrganizationId}:${templateId ?? 'none'}:${kind ?? 'none'}:${dateInput ?? 'none'}:${timeInput ?? 'none'}`
      : null;

    if (!composeRequested) {
      setHandledComposeKey(null);
      return;
    }

    if (!composeKey || handledComposeKey === composeKey) {
      return;
    }

    const baseDate = dateInput && timeInput ? parseDateTimeInput(dateInput, timeInput) : roundToNextHalfHour(new Date());

    setActiveSidePanel('compose');
    setComposer((current) => {
      let nextState: ComposerState = {
        ...current,
        kind: kind ?? current.kind,
        dateInput: formatDateInput(baseDate),
        timeInput: formatTimeInput(baseDate),
      };

      if ((kind ?? current.kind) === 'PERFORMANCE' && templateId) {
        nextState = hydrateComposerFromTemplate(templateId, nextState);
      }

      return nextState;
    });

    setHandledComposeKey(composeKey);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('compose');
    params.delete('kind');
    params.delete('templateId');
    params.delete('date');
    params.delete('time');
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl as Route);
  }, [activeOrganizationId, handledComposeKey, hydrateComposerFromTemplate, pathname, router, searchParams]);

  useEffect(() => {
    if (!accessToken || !activeOrganizationId) {
      setConflicts(null);
      return;
    }

    if (composer.participantIds.length === 0) {
      setConflicts(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCheckingConflicts(true);

      try {
        const startsAt = parseDateTimeInput(composer.dateInput, composer.timeInput);
        const result = await operationsApi.checkConflicts({
          organizationId: activeOrganizationId,
          accessToken,
          participantIds: composer.participantIds,
          startsAt: startsAt.toISOString(),
          endsAt: addMinutes(startsAt, Math.max(15, composer.durationMinutes)).toISOString(),
          signal: controller.signal,
        });

        setConflicts(result.hasConflicts ? result : null);
      } catch {
        if (!controller.signal.aborted) {
          setConflicts(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingConflicts(false);
        }
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accessToken, activeOrganizationId, composer.dateInput, composer.durationMinutes, composer.participantIds, composer.timeInput]);

  const replaceEvent = (updatedEvent: CalendarEvent) => {
    setEvents((current) => current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)));
  };

  const persistEvent = async (baseEvent: CalendarEvent, nextEvent: CalendarEvent, successMessage: string) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setSaving(true);
    setErrorText(null);

    replaceEvent(nextEvent);

    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: baseEvent.id,
        payload: toUpdatePayload(nextEvent),
      });

      replaceEvent(mapEventRecordToCalendarEvent(updated));
      setNoticeText(successMessage);
    } catch (error) {
      replaceEvent(baseEvent);
      setErrorText(error instanceof Error ? error.message : 'Не удалось обновить событие.');
    } finally {
      setSaving(false);
    }
  };

  const navigate = (direction: -1 | 1) => {
    setCursorDate((current) => {
      if (viewMode === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      }

      return addDays(current, direction * 7);
    });
  };

  const handleDropDay = (targetDay: Date) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const eventId = event.dataTransfer.getData('text/calendar-event-id') || draggingEventId;

    if (!eventId) {
      return;
    }

    const baseEvent = events.find((item) => item.id === eventId);
    if (!baseEvent) {
      return;
    }

    const nextEvent = moveEventToDay(baseEvent, targetDay);
    setDraggingEventId(null);
    void persistEvent(baseEvent, nextEvent, 'Событие перенесено на другой день.');
  };

  const handleDropWeekSlot = (targetDay: Date, hour: number) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const eventId = event.dataTransfer.getData('text/calendar-event-id') || draggingEventId;

    if (!eventId) {
      return;
    }

    const baseEvent = events.find((item) => item.id === eventId);
    if (!baseEvent) {
      return;
    }

    const nextEvent = moveEventToWeekSlot(baseEvent, targetDay, hour);
    setDraggingEventId(null);
    void persistEvent(baseEvent, nextEvent, 'Событие перенесено по сетке недели.');
  };

  const handleKindChange = (nextKind: ComposerKind) => {
    setComposer((current) => {
      const nextState: ComposerState = { ...current, kind: nextKind };

      if (nextKind === 'PERFORMANCE' && current.templateId) {
        return hydrateComposerFromTemplate(current.templateId, nextState);
      }

      return nextState;
    });
    setActiveSidePanel('compose');
  };

  const handleTemplateChange = (templateId: string) => {
    setComposer((current) => hydrateComposerFromTemplate(templateId, current));
  };

  const submitComposer = async (ignoreConflicts = false) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    if (composer.kind === 'PERFORMANCE' && !composer.templateId) {
      setErrorText('Сначала выберите спектакль из списка.');
      return;
    }

    if (composer.kind !== 'PERFORMANCE' && composer.title.trim().length < 2) {
      setErrorText('Укажите название события.');
      return;
    }

    if (conflicts?.hasConflicts && !ignoreConflicts) {
      setErrorText('Есть конфликты по занятости. Проверьте состав или создайте событие несмотря на предупреждение.');
      return;
    }

    const startsAt = parseDateTimeInput(composer.dateInput, composer.timeInput);
    const durationMinutes = Math.max(15, composer.durationMinutes);
    const template = composer.templateId ? templatesById.get(composer.templateId) ?? null : null;
    const trimmedTitle = composer.title.trim();
    const performanceTitle =
      template?.name ?? (trimmedTitle.length > 0 ? trimmedTitle : ru.calendar.untitledEvent);
    const title = composer.kind === 'PERFORMANCE' ? performanceTitle : composer.title.trim();

    setSaving(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      const created = await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title,
          type: composer.kind,
          status: 'PLANNED',
          startsAt: startsAt.toISOString(),
          endsAt: addMinutes(startsAt, durationMinutes).toISOString(),
          templateId: composer.kind === 'PERFORMANCE' ? composer.templateId || undefined : undefined,
          ignoreConflicts,
          participants: composer.participantIds.map((participantId) => ({ participantId })),
        },
      });

      const mapped = mapEventRecordToCalendarEvent(created);
      setEvents((current) => [...current, mapped]);
      setSelectedEventId(mapped.id);
      setNoticeText('Событие добавлено в расписание.');
      const currentDefaults = loadWorkspaceDefaults(activeOrganizationId);
      const defaults = saveWorkspaceDefaults(activeOrganizationId, {
        lastEventType: composer.kind,
        lastEventDurationMinutes: durationMinutes,
        recentParticipantIds: composer.participantIds,
        recentTemplateIds:
          composer.kind === 'PERFORMANCE' && composer.templateId
            ? pushRecentId(currentDefaults.recentTemplateIds, composer.templateId)
            : currentDefaults.recentTemplateIds,
      });

      const nextStart = addMinutes(startsAt, durationMinutes);
      setComposer((current) => ({
        ...current,
        dateInput: formatDateInput(nextStart),
        timeInput: formatTimeInput(nextStart),
        title: current.kind === 'PERFORMANCE' ? current.title : '',
        participantIds:
          current.kind === 'PERFORMANCE' && current.templateId
            ? templateParticipantIds(template)
            : defaults.recentParticipantIds ?? current.participantIds,
      }));
      setConflicts(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось добавить событие.');
    } finally {
      setSaving(false);
    }
  };

  const renderEventChip = (event: CalendarEvent) => (
    <button
      key={event.id}
      className={`event-chip type-${event.type.toLowerCase()}${selectedEventId === event.id ? ' is-selected' : ''}`}
      draggable
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.setData('text/calendar-event-id', event.id);
        dragEvent.dataTransfer.effectAllowed = 'move';
        setDraggingEventId(event.id);
      }}
      onDragEnd={() => setDraggingEventId(null)}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        setSelectedEventId(event.id);
      }}
      type="button"
    >
      <span className="chip-time">{timeFormat.format(event.startsAt)}</span>
      <span className="chip-title">{event.title}</span>
      <span className="chip-meta">
        {event.type === 'PERFORMANCE'
          ? eventTypeLabels[event.type]
          : `${eventTypeLabels[event.type]} · ${event.durationMinutes} ${ru.calendar.minuteShort}`}
      </span>
    </button>
  );

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <div className="calendar-shell">
          <header className="calendar-header">
            <div>
              <p className="kicker">{ru.calendar.liveKicker}</p>
              <h1>{ru.calendar.title}</h1>
            </div>
          </header>
          <WorkspaceOrgEmpty />
        </div>
      </section>
    );
  }

  return (
    <main className="calendar-page calendar-page--compact">
      <section className="calendar-shell calendar-shell--premium calendar-shell--compact">
        <header className="calendar-header">
          <div>
            <p className="kicker">{ru.calendar.liveKicker}</p>
            <h1>{ru.calendar.title}</h1>
            <p className="period-label">{periodLabel}</p>
          </div>

          <div className="toolbar">
            <div className="segmented">
              <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')} type="button">
                {ru.calendar.views.week}
              </button>
              <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')} type="button">
                {ru.calendar.views.month}
              </button>
            </div>

            <div className="nav-controls">
              <button onClick={() => navigate(-1)} type="button">{ru.calendar.navigation.previous}</button>
              <button onClick={() => setCursorDate(startOfDay(new Date()))} type="button">{ru.calendar.navigation.today}</button>
              <button onClick={() => navigate(1)} type="button">{ru.calendar.navigation.next}</button>
            </div>

            <Button type="button" onClick={() => openComposerAt(roundToNextHalfHour(new Date()))}>
              {ru.calendar.quickEvent}
            </Button>
          </div>
        </header>

        {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
        {errorText ? <p className="finance-error">{errorText}</p> : null}
        {loading ? <p className="empty-state">Загружаем расписание организации...</p> : null}

        {!loading && viewMode === 'month' ? (
          <section className="month-view">
            <div className="month-weekday-row">
              {weekDayLabels.map((day) => <div key={day}>{day}</div>)}
            </div>

            <div className="month-grid">
              {monthDays.map((day) => {
                const key = toDayKey(day);
                const items = monthEventMap.get(key) ?? [];
                const isOutside = day.getMonth() !== cursorDate.getMonth();
                const isToday = isSameDay(day, new Date());

                return (
                  <article
                    key={key}
                    className={`month-cell${isOutside ? ' outside' : ''}${isToday ? ' today' : ''}`}
                    onClick={() => openComposerAt(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 19, 0), composer.kind)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropDay(day)}
                  >
                    <div className="month-cell-header">
                      <span>{day.getDate()}</span>
                      {isToday ? <small>{ru.calendar.todayBadge}</small> : null}
                    </div>
                    <div className="month-events">
                      {items.slice(0, 2).map((item) => renderEventChip(item))}
                      {items.length > 2 ? <p className="more-events">{ru.calendar.moreEvents(items.length - 2)}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {!loading && viewMode === 'week' ? (
          <section className="week-view">
            <div className="week-grid-head">
              <div className="time-col-label">{ru.calendar.timeColumn}</div>
              {weekDays.map((day) => (
                <div key={toDayKey(day)} className={isSameDay(day, new Date()) ? 'today' : ''}>
                  <strong>{weekdayLongFormat.format(day)}</strong>
                </div>
              ))}
            </div>

            <div className="week-grid-body">
              {weekHours.map((hour) => (
                <div key={hour} className="hour-row">
                  <div className="hour-label">{String(hour).padStart(2, '0')}:00</div>

                  {weekDays.map((day) => {
                    const slotEvents = sortedEvents.filter(
                      (item) => isSameDay(item.startsAt, day) && item.startsAt.getHours() === hour,
                    );

                    return (
                      <div
                        key={`${toDayKey(day)}-${hour}`}
                        className="hour-slot"
                        onClick={() => {
                          const slotDate = new Date(day);
                          slotDate.setHours(hour, 0, 0, 0);
                          openComposerAt(slotDate, composer.kind);
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDropWeekSlot(day, hour)}
                      >
                        {slotEvents.map((item) => renderEventChip(item))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <aside className="side-stack side-stack--calendar">
        <div className="side-tabs side-tabs--premium">
          <button type="button" className={activeSidePanel === 'compose' ? 'is-active' : ''} onClick={() => setActiveSidePanel('compose')}>
            Добавить
          </button>
          <button type="button" className={activeSidePanel === 'chat' ? 'is-active' : ''} onClick={() => setActiveSidePanel('chat')}>
            Чат
          </button>
          <button type="button" className={activeSidePanel === 'finance' ? 'is-active' : ''} onClick={() => setActiveSidePanel('finance')}>
            Баллы
          </button>
        </div>

        {activeSidePanel === 'compose' ? (
          <section className="composer-panel quick-panel">
            <div className="composer-panel__header">
              <div>
                <h2>{ru.calendar.composer.title}</h2>
                <p>{ru.calendar.composer.description}</p>
              </div>
              <span className="composer-panel__hint">{ru.calendar.composer.helpers.slotHint}</span>
            </div>

            <div className="composer-kind-switcher">
              {(['PERFORMANCE', 'REHEARSAL', 'EVENT'] as const).map((kind) => (
                <button key={kind} type="button" className={composer.kind === kind ? 'is-active' : ''} onClick={() => handleKindChange(kind)}>
                  <strong>{kindLabels[kind]}</strong>
                  <span>
                    {kind === 'PERFORMANCE'
                      ? 'Из готового шаблона'
                      : kind === 'REHEARSAL'
                        ? 'Название и состав'
                        : 'Свободный формат'}
                  </span>
                </button>
              ))}
            </div>

            {selectedEvent ? (
              <div className="calendar-selected-note">
                <strong>Выбрано событие: {selectedEvent.title}</strong>
                <span>{timeFormat.format(selectedEvent.startsAt)} · {eventTypeLabels[selectedEvent.type]}</span>
              </div>
            ) : null}

            {composer.kind === 'PERFORMANCE' ? (
              <Select
                label={ru.calendar.composer.fields.template}
                value={composer.templateId}
                onChange={(event) => handleTemplateChange(event.target.value)}
                hint={ru.calendar.composer.helpers.performance}
              >
                <option value="">Выберите спектакль</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                label={ru.calendar.composer.fields.title}
                value={composer.title}
                onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))}
                placeholder={composer.kind === 'REHEARSAL' ? 'Репетиция состава' : 'Встреча, сбор, мастер-класс'}
              />
            )}

            {composer.kind === 'PERFORMANCE' && selectedTemplate ? (
              <div className="composer-template-preview">
                <strong>{selectedTemplate.name}</strong>
                <span>{templateParticipantIds(selectedTemplate).length} участников</span>
              </div>
            ) : null}

            {composer.kind === 'PERFORMANCE' && templates.length === 0 ? (
              <div className="resource-empty-inline">
                <strong>Спектаклей пока нет</strong>
                <p>{ru.calendar.composer.helpers.emptyTemplate}</p>
              </div>
            ) : null}

            <div className="resource-form-grid resource-form-grid--double">
              <Input
                label={ru.calendar.composer.fields.date}
                type="date"
                value={composer.dateInput}
                onChange={(event) => setComposer((current) => ({ ...current, dateInput: event.target.value }))}
              />
              <Input
                label={ru.calendar.composer.fields.time}
                type="time"
                value={composer.timeInput}
                onChange={(event) => setComposer((current) => ({ ...current, timeInput: event.target.value }))}
              />
            </div>

            {composer.kind !== 'PERFORMANCE' ? (
              <>
                <div className="modal-form-section">
                  <span className="quick-choice-label">{ru.calendar.composer.defaults.duration}</span>
                  <div className="quick-choice-row quick-choice-row--wide">
                    {durationPresets.map((duration) => (
                      <button
                        key={duration}
                        type="button"
                        className={`quick-choice-chip${composer.durationMinutes === duration ? ' is-active' : ''}`}
                        onClick={() => setComposer((current) => ({ ...current, durationMinutes: duration }))}
                      >
                        {duration} мин
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label={ru.calendar.composer.fields.duration}
                  min={15}
                  step={15}
                  type="number"
                  value={String(composer.durationMinutes)}
                  onChange={(event) =>
                    setComposer((current) => ({
                      ...current,
                      durationMinutes: Math.max(15, Number(event.target.value) || 15),
                    }))
                  }
                />
              </>
            ) : null}

            {recentTemplateCards.length > 0 && composer.kind === 'PERFORMANCE' ? (
              <div className="composer-chip-group">
                <span className="quick-choice-label">{ru.calendar.composer.defaults.recentTemplates}</span>
                <div className="quick-choice-row quick-choice-row--wide">
                  {recentTemplateCards.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`quick-choice-chip${composer.templateId === template.id ? ' is-active' : ''}`}
                      onClick={() => handleTemplateChange(template.id)}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {recentParticipants.length > 0 ? (
              <div className="composer-chip-group">
                <span className="quick-choice-label">{ru.calendar.composer.defaults.recentParticipants}</span>
                <div className="quick-choice-row quick-choice-row--wide">
                  {recentParticipants.map((participant) => {
                    const active = composer.participantIds.includes(participant.id);
                    return (
                      <button
                        key={participant.id}
                        type="button"
                        className={`quick-choice-chip${active ? ' is-active' : ''}`}
                        onClick={() =>
                          setComposer((current) => ({
                            ...current,
                            participantIds: active
                              ? current.participantIds.filter((item) => item !== participant.id)
                              : uniqueIds([...current.participantIds, participant.id]),
                          }))
                        }
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
              recentIds={recentDefaults.recentParticipantIds ?? []}
              value={composer.participantIds}
              onChange={(value) => setComposer((current) => ({ ...current, participantIds: value }))}
            />

            {checkingConflicts ? <p className="empty-state">Проверяем пересечения по занятости...</p> : null}
            {conflicts?.hasConflicts ? (
              <div className="composer-conflict-card">
                <strong>{ru.calendar.composer.conflictTitle}</strong>
                <p>{conflicts.summary.conflictedParticipants} участников пересекаются с другим расписанием.</p>
              </div>
            ) : null}

            <div className="composer-panel__actions">
              <Button type="button" fullWidth onClick={() => void submitComposer()} loading={saving}>
                {ru.calendar.composer.actions.submit}
              </Button>
              {conflicts?.hasConflicts ? (
                <Button type="button" variant="ghost" fullWidth onClick={() => void submitComposer(true)} loading={saving}>
                  {ru.calendar.composer.actions.forceSubmit}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeSidePanel === 'finance' ? (
          <LazyPointsIncomePanel organizationId={activeOrganizationId} accessToken={accessToken} lockWorkspace />
        ) : null}

        {activeSidePanel === 'chat' ? (
          <LazyChatPanel
            organizationId={activeOrganizationId}
            accessToken={accessToken}
            defaultEventId={selectedEventId}
            defaultScope={selectedEventId ? 'EVENT' : 'ORGANIZATION'}
            lockWorkspace
          />
        ) : null}
      </aside>
    </main>
  );
}


