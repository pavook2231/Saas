'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  operationsApi,
  participantDisplayName,
  type EventRecord,
  type EventType,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { canAccessControlPanel } from '@/lib/organization-access';
import { isVenueName, venueLabelMap, venueOptions, venueToneClass, type VenueName } from '@/lib/venues';

type ViewMode = 'week' | 'month';
type CalendarPanelMode = 'main' | 'compact';
type TheatreLane = 'PERFORMANCE' | 'REHEARSAL' | 'TOUR' | 'OTHER';
type CalendarComposerKind = 'PERFORMANCE' | 'REHEARSAL' | 'TOUR' | 'EVENT';
type CalendarComposerState = {
  lane: TheatreLane | null;
  kind: CalendarComposerKind;
  playId: string;
  title: string;
  date: string;
  startsAt: string;
  assemblyAt: string;
  durationMinutes: number;
  location: VenueName;
  participantIds: string[];
  description: string;
};

const alternateRoleSuffixPattern = /\s+\(дубль\)$/i;

const weekDayLabels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const monthTitleFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const weekdayLongFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const weekDayNameFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
});
const weekDayNumberFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const addDays = (date: Date, amount: number): Date => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
};

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

const toDayKey = (date: Date): string => formatDateInput(date);

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const typeLabel: Record<EventRecord['type'], string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Гастроли',
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

const theatreLaneMeta: Array<{
  id: TheatreLane;
  label: string;
  mobileLabel: string;
  iconClassName: string;
}> = [
  {
    id: 'PERFORMANCE',
    label: 'Спектакли',
    mobileLabel: 'Спектакль',
    iconClassName: 'is-performance',
  },
  {
    id: 'REHEARSAL',
    label: 'Репетиции',
    mobileLabel: 'Репетиция',
    iconClassName: 'is-rehearsal',
  },
  {
    id: 'TOUR',
    label: 'Гастроли',
    mobileLabel: 'Гастр.',
    iconClassName: 'is-tour',
  },
  {
    id: 'OTHER',
    label: 'Прочее',
    mobileLabel: 'Прочее',
    iconClassName: 'is-other',
  },
];

const composerKindLabels: Record<CalendarComposerKind, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Гастроли',
  EVENT: 'Событие',
};

const composerDurationOptions = [30, 45, 60, 90, 120, 150, 180];

const defaultDurationByKind: Record<CalendarComposerKind, number> = {
  PERFORMANCE: 120,
  REHEARSAL: 120,
  TOUR: 120,
  EVENT: 90,
};

const getEventTimeRange = (event: EventRecord) =>
  `${timeFormat.format(new Date(event.startsAt))} — ${timeFormat.format(new Date(event.endsAt))}`;

const getEventScheduleRange = (event: Pick<EventRecord, 'startsAt' | 'endsAt' | 'assemblyAt'>) => {
  const performanceTime = `${timeFormat.format(new Date(event.startsAt))} — ${timeFormat.format(new Date(event.endsAt))}`;
  return event.assemblyAt ? `Выезд ${timeFormat.format(new Date(event.assemblyAt))} · ${performanceTime}` : performanceTime;
};

const classifyTheatreLane = (event: EventRecord): TheatreLane => {
  if (event.type === 'PERFORMANCE') {
    return 'PERFORMANCE';
  }

  if (event.type === 'REHEARSAL') {
    return 'REHEARSAL';
  }

  if (event.type === 'TOUR') {
    return 'TOUR';
  }

  const searchableText = `${event.title} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase();
  if (searchableText.includes('гастрол')) {
    return 'TOUR';
  }

  return 'OTHER';
};

const mapLaneToComposerKind = (lane: TheatreLane | null): CalendarComposerKind => {
  if (lane === 'PERFORMANCE') {
    return 'PERFORMANCE';
  }

  if (lane === 'REHEARSAL') {
    return 'REHEARSAL';
  }

  if (lane === 'TOUR') {
    return 'TOUR';
  }

  return 'EVENT';
};

const defaultLocationForLane = (lane: TheatreLane | null): VenueName =>
  lane === 'REHEARSAL' ? 'Реп зал' : lane === 'TOUR' ? 'Выезд' : 'БЗ';

const defaultTitleForLane = (lane: TheatreLane | null) => (lane === 'TOUR' ? 'Гастроли' : '');

const defaultStartTimeForDate = (date: Date) => {
  if (isSameDay(date, new Date())) {
    const clone = new Date();
    clone.setMinutes(clone.getMinutes() + 30);
    clone.setSeconds(0, 0);
    clone.setMinutes(clone.getMinutes() >= 30 ? 30 : 0);
    return `${String(clone.getHours()).padStart(2, '0')}:${String(clone.getMinutes()).padStart(2, '0')}`;
  }

  return '12:00';
};

const toIso = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
};

const plusMinutesIso = (iso: string, minutes: number) => {
  const clone = new Date(iso);
  clone.setMinutes(clone.getMinutes() + minutes);
  return clone.toISOString();
};

const formatDurationLabel = (minutes: number) => {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours > 0 && restMinutes > 0) {
    return `${hours} ч ${restMinutes} мин`;
  }

  if (hours > 0) {
    return `${hours} ч`;
  }

  return `${restMinutes} мин`;
};

const durationBetweenIsoMinutes = (startsAt: string, endsAt: string) =>
  Math.max(15, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));

const formatTimeInputValue = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const isAlternateRoleName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return normalized === 'дубль' || alternateRoleSuffixPattern.test(name.trim());
};

const templateHasAlternateCast = (template: TemplateRecord | null) =>
  Boolean(template?.roles.some((role) => isAlternateRoleName(role.name)));

const mapPlayParticipants = (play: TemplateRecord) =>
  Array.from(new Set(play.roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId))));

export function CalendarWorkspace() {
  const searchParams = useSearchParams();
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [panelMode, setPanelMode] = useState<CalendarPanelMode>('main');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [composerState, setComposerState] = useState<CalendarComposerState | null>(null);
  const [composerEditingEventId, setComposerEditingEventId] = useState<string | null>(null);
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerErrorText, setComposerErrorText] = useState<string | null>(null);
  const [eventActionLoading, setEventActionLoading] = useState<'cancel' | 'delete' | null>(null);

  const canOpenControlPanel = canAccessControlPanel(activeRole);

  const loadCalendar = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setEvents([]);
      setTemplates([]);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [eventsResponse, participantsResponse, templatesResponse] = await Promise.all([
        operationsApi.listEvents({
          organizationId: activeOrganizationId,
          accessToken,
          from: addDays(startOfMonthGrid(cursorDate), -7).toISOString(),
          to: addDays(startOfMonthGrid(cursorDate), 49).toISOString(),
          limit: 300,
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 300,
        }),
        canOpenControlPanel
          ? operationsApi.listTemplates({
              organizationId: activeOrganizationId,
              accessToken,
              limit: 150,
              type: 'PERFORMANCE',
              isActive: true,
            })
          : Promise.resolve([] as TemplateRecord[]),
      ]);

      setEvents(eventsResponse);
      setParticipants(participantsResponse);
      setTemplates(templatesResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, canOpenControlPanel, cursorDate]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const eventId = searchParams.get('eventId');

    if (!eventId || events.length === 0) {
      return;
    }

    const focusedEvent = events.find((event) => event.id === eventId);

    if (!focusedEvent) {
      return;
    }

    setSelectedEventId(focusedEvent.id);
    setCursorDate(startOfDay(new Date(focusedEvent.startsAt)));
    setViewMode('week');
  }, [events, searchParams]);

  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedParticipants = useMemo(
    () =>
      selectedEvent
        ? selectedEvent.participants
            .map((item) => participantsById.get(item.participantId))
            .filter((participant): participant is ParticipantRecord => participant !== undefined)
        : [],
    [participantsById, selectedEvent],
  );

  const composerSelectedPlay = useMemo(
    () => templates.find((template) => template.id === composerState?.playId) ?? null,
    [composerState?.playId, templates],
  );
  const composerSelectedPlayHasAlternateCast = useMemo(
    () => templateHasAlternateCast(composerSelectedPlay),
    [composerSelectedPlay],
  );

  const composerDurationMinutes = useMemo(() => {
    if (!composerState) {
      return defaultDurationByKind.EVENT;
    }

    return composerState.kind === 'PERFORMANCE'
      ? composerSelectedPlay?.durationMinutes ?? defaultDurationByKind.PERFORMANCE
      : composerState.durationMinutes;
  }, [composerSelectedPlay, composerState]);

  const composerEndsAtLabel = useMemo(() => {
    if (!composerState?.date || !composerState.startsAt) {
      return null;
    }

    const startsAtIso = toIso(composerState.date, composerState.startsAt);
    return timeFormat.format(new Date(plusMinutesIso(startsAtIso, composerDurationMinutes)));
  }, [composerDurationMinutes, composerState?.date, composerState?.startsAt]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursorDate]);

  const monthDays = useMemo(() => {
    const start = startOfMonthGrid(cursorDate);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursorDate]);

  const monthEventMap = useMemo(() => {
    const map = new Map<string, EventRecord[]>();

    for (const event of events) {
      const key = toDayKey(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }

    return map;
  }, [events]);

  const theatreWeekMap = useMemo(() => {
    const map = new Map<string, Record<TheatreLane, EventRecord[]>>();

    for (const day of weekDays) {
      map.set(toDayKey(day), {
        PERFORMANCE: [],
        REHEARSAL: [],
        TOUR: [],
        OTHER: [],
      });
    }

    for (const event of events) {
      const eventDate = new Date(event.startsAt);
      const key = toDayKey(eventDate);
      const currentDay = map.get(key);

      if (!currentDay) {
        continue;
      }

      currentDay[classifyTheatreLane(event)].push(event);
    }

    for (const lanes of map.values()) {
      for (const lane of theatreLaneMeta) {
        lanes[lane.id].sort((left, right) => {
          return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
        });
      }
    }

    return map;
  }, [events, weekDays]);

  const weekHasEvents = useMemo(
    () => weekDays.some((day) => (monthEventMap.get(toDayKey(day))?.length ?? 0) > 0),
    [monthEventMap, weekDays],
  );

  const mobileWeekDays = useMemo(
    () =>
      weekDays.map((day) => {
        const dayKey = toDayKey(day);
        const laneEvents = theatreWeekMap.get(dayKey) ?? {
          PERFORMANCE: [],
          REHEARSAL: [],
          TOUR: [],
          OTHER: [],
        };
        const sections = theatreLaneMeta
          .map((lane) => ({
            lane,
            events: laneEvents[lane.id],
          }))
          .filter((section) => section.events.length > 0);
        const summary = theatreLaneMeta
          .map((lane) => ({
            lane,
            count: laneEvents[lane.id].length,
          }))
          .filter((item) => item.count > 0);

        return {
          day,
          dayKey,
          sections,
          summary,
          totalEvents: sections.reduce((count, section) => count + section.events.length, 0),
          isToday: isSameDay(day, new Date()),
        };
      }),
    [theatreWeekMap, weekDays],
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => event.status !== 'CANCELLED' && new Date(event.endsAt).getTime() >= now)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [events]);

  const todayEvents = useMemo(
    () => upcomingEvents.filter((event) => isSameDay(new Date(event.startsAt), new Date())),
    [upcomingEvents],
  );

  const compactUpcomingEvents = useMemo(() => upcomingEvents.slice(0, 6), [upcomingEvents]);

  const compactQuickDays = useMemo(
    () =>
      weekDays.map((day) => {
        const dayEvents = monthEventMap.get(toDayKey(day)) ?? [];
        return {
          day,
          count: dayEvents.length,
          firstEvent: dayEvents[0] ?? null,
          isToday: isSameDay(day, new Date()),
        };
      }),
    [monthEventMap, weekDays],
  );

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return monthTitleFormat.format(cursorDate);
    }

    const start = weekDays[0];
    const end = weekDays[weekDays.length - 1];
    return `${weekdayLongFormat.format(start)} — ${weekdayLongFormat.format(end)}`;
  }, [cursorDate, viewMode, weekDays]);

  const navigate = (direction: number) => {
    setCursorDate((current) => addDays(current, viewMode === 'month' ? direction * 28 : direction * 7));
  };

  const buildComposerStateForEvent = (event: EventRecord): CalendarComposerState => {
    const lane = classifyTheatreLane(event);
    return {
      lane,
      kind:
        event.type === 'PERFORMANCE'
          ? 'PERFORMANCE'
          : event.type === 'REHEARSAL'
            ? 'REHEARSAL'
            : event.type === 'TOUR' || lane === 'TOUR'
              ? 'TOUR'
              : 'EVENT',
      playId: event.templateId ?? '',
      title: event.type === 'PERFORMANCE' ? event.template?.name ?? event.title : event.title,
      date: formatDateInput(new Date(event.startsAt)),
      startsAt: formatTimeInputValue(event.startsAt),
      assemblyAt: event.assemblyAt ? formatTimeInputValue(event.assemblyAt) : '',
      durationMinutes: durationBetweenIsoMinutes(event.startsAt, event.endsAt),
      location: isVenueName(event.location) ? event.location : defaultLocationForLane(classifyTheatreLane(event)),
      participantIds: event.participants.map((item) => item.participantId),
      description: event.description ?? '',
    };
  };

  const openComposer = (date: Date, lane: TheatreLane | null = null) => {
    const kind = mapLaneToComposerKind(lane);

    setComposerEditingEventId(null);
    setComposerState({
      lane,
      kind,
      playId: '',
      title: defaultTitleForLane(lane),
      date: formatDateInput(date),
      startsAt: defaultStartTimeForDate(date),
      assemblyAt: '',
      durationMinutes: defaultDurationByKind[kind],
      location: defaultLocationForLane(lane),
      participantIds: [],
      description: '',
    });
    setComposerErrorText(null);
  };

  const closeComposer = () => {
    if (composerSaving) {
      return;
    }

    setComposerEditingEventId(null);
    setComposerState(null);
    setComposerErrorText(null);
  };

  const openComposerForReplacement = (event: EventRecord) => {
    setSelectedEventId(null);
    setComposerEditingEventId(event.id);
    setComposerState(buildComposerStateForEvent(event));
    setComposerErrorText(null);
  };

  const handleComposerKindChange = (kind: CalendarComposerKind) => {
    setComposerState((current) =>
      current
        ? {
            ...current,
            kind,
            playId: kind === 'PERFORMANCE' ? current.playId : '',
            title:
              kind === 'TOUR'
                ? 'Гастроли'
                : kind === 'EVENT' && current.lane === 'TOUR'
                  ? 'Гастроли'
                  : kind === 'PERFORMANCE'
                    ? ''
                    : current.title,
            durationMinutes: kind === 'PERFORMANCE' ? current.durationMinutes : defaultDurationByKind[kind],
            location: kind === 'REHEARSAL' ? 'Реп зал' : kind === 'TOUR' ? 'Выезд' : current.location,
            participantIds: kind === 'PERFORMANCE' ? [] : current.participantIds,
          }
        : current,
    );
  };

  const handleComposerPlayChange = (playId: string) => {
    const play = templates.find((template) => template.id === playId);

    setComposerState((current) =>
      current
        ? {
            ...current,
            playId,
            title: play?.name ?? '',
            location: isVenueName(play?.location) ? play.location : current.location,
            participantIds:
              play && !templateHasAlternateCast(play)
                ? mapPlayParticipants(play)
                : [],
          }
        : current,
    );
  };

  const handleComposerSave = async () => {
    if (!composerState || !accessToken || !activeOrganizationId) {
      return;
    }

    setComposerSaving(true);
    setComposerErrorText(null);

    try {
      const startsAtIso = toIso(composerState.date, composerState.startsAt);
      const endsAtIso = plusMinutesIso(startsAtIso, composerDurationMinutes);
      const payloadType: EventType =
        composerState.kind === 'EVENT'
          ? composerState.location === 'Выезд' || composerState.lane === 'TOUR'
            ? 'TOUR'
            : 'EVENT'
          : composerState.kind;
      const title =
        composerState.kind === 'PERFORMANCE'
          ? composerSelectedPlay?.name ?? ''
          : composerState.title.trim();

      if (composerState.kind === 'PERFORMANCE' && !composerState.playId) {
        throw new Error('Выберите спектакль.');
      }

      if (!title) {
        throw new Error('Укажите название события.');
      }

      const payload = {
        title,
        type: payloadType,
        status: 'PLANNED' as const,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        assemblyAt: composerState.kind === 'TOUR' && composerState.assemblyAt ? toIso(composerState.date, composerState.assemblyAt) : undefined,
        location: composerState.location,
        description: composerState.description.trim() || undefined,
        templateId: composerState.kind === 'PERFORMANCE' ? composerState.playId : undefined,
        participants:
          composerState.kind === 'PERFORMANCE'
            ? undefined
            : composerState.participantIds.map((participantId) => ({
                participantId,
                isRequired: true,
              })),
      };

      const saved = composerEditingEventId
        ? await operationsApi.updateEvent({
            organizationId: activeOrganizationId,
            accessToken,
            eventId: composerEditingEventId,
            payload,
          })
        : await operationsApi.createEvent({
            organizationId: activeOrganizationId,
            accessToken,
            payload,
          });

      setEvents((current) =>
        (composerEditingEventId
          ? current.map((event) => (event.id === saved.id ? saved : event))
          : [...current, saved]
        ).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
      );
      setSelectedEventId(saved.id);
      setCursorDate(startOfDay(new Date(saved.startsAt)));
      setComposerEditingEventId(null);
      setComposerState(null);
    } catch (error) {
      setComposerErrorText(
        error instanceof Error
          ? error.message
          : composerEditingEventId
            ? 'Не удалось сохранить изменения.'
            : 'Не удалось создать событие.',
      );
    } finally {
      setComposerSaving(false);
    }
  };

  const handleCancelSelectedEvent = async () => {
    if (!selectedEvent || !accessToken || !activeOrganizationId || eventActionLoading) {
      return;
    }

    setEventActionLoading('cancel');
    setErrorText(null);

    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: selectedEvent.id,
        payload: {
          status: 'CANCELLED',
        },
      });

      setEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)));
      setSelectedEventId(updated.id);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отменить событие.');
    } finally {
      setEventActionLoading(null);
    }
  };

  const handleDeleteSelectedEvent = async () => {
    if (!selectedEvent || !accessToken || !activeOrganizationId || eventActionLoading) {
      return;
    }

    setEventActionLoading('delete');
    setErrorText(null);

    try {
      await operationsApi.deleteEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: selectedEvent.id,
      });

      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      setSelectedEventId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить событие.');
    } finally {
      setEventActionLoading(null);
    }
  };

  const renderEventChip = (event: EventRecord) => {
    const venue = isVenueName(event.location) ? event.location : null;

    return (
      <button
        key={event.id}
        type="button"
        className={`event-chip type-${event.type.toLowerCase()}${selectedEventId === event.id ? ' is-selected' : ''}${event.status === 'CANCELLED' ? ' status-cancelled' : ''}`}
        onClick={(action) => {
          action.stopPropagation();
          setSelectedEventId(event.id);
        }}
      >
        <span className="chip-time">{getEventScheduleRange(event)}</span>
        <span className="chip-title">{event.title}</span>
        <span className="chip-meta">
          {typeLabel[event.type]}
          {event.performanceCastNumber ? ` · ${event.performanceCastNumber} состав` : ''}
          {venue ? ` · ${venue}` : ''}
        </span>
      </button>
    );
  };

  const renderTheatreEvent = (event: EventRecord, options?: { showTypeLabel?: boolean }) => {
    const venue = isVenueName(event.location) ? event.location : null;
    const timeRange = getEventScheduleRange(event);
    const showTypeLabel = options?.showTypeLabel ?? true;

    return (
      <button
        key={event.id}
        type="button"
        className={`theatre-event theatre-event--${event.type.toLowerCase()}${selectedEventId === event.id ? ' is-selected' : ''}${event.status === 'CANCELLED' ? ' is-cancelled' : ''}`}
        onClick={() => setSelectedEventId(event.id)}
      >
        <div className="theatre-event__eyebrow">
          <span
            className={`theatre-event__marker theatre-event__marker--${event.type.toLowerCase()}`}
            aria-hidden="true"
          />
          {showTypeLabel ? <span className="theatre-event__type">{typeLabel[event.type]}</span> : null}
        </div>
        <div className="theatre-event__primary">
          <strong>{event.title}</strong>
          <span className="theatre-event__time" aria-label={`Время ${timeRange}`}>
            {timeRange}
          </span>
        </div>
        <div className="theatre-event__meta">
          {venue ? (
            <Badge
              className={`venue-badge ${venueToneClass[venue]} theatre-event__venue`}
              title={venueLabelMap[venue]}
            >
              {venue}
            </Badge>
          ) : null}
          {event.performanceCastNumber ? <Badge variant="primary">{event.performanceCastNumber} состав</Badge> : null}
          {event.status === 'CANCELLED' ? <Badge variant="warning">Отменено</Badge> : null}
        </div>
      </button>
    );
  };

  const formatDayName = (date: Date) => {
    const label = weekDayNameFormat.format(date).replace('.', '').trim();
    return label.slice(0, 1).toUpperCase() + label.slice(1);
  };

  if (!activeOrganizationId || !accessToken) {
    return (
      <section className="app-page">
        <Card>
          <CardHeader>
            <CardTitle>Календарь</CardTitle>
            <CardDescription>Сначала выберите организацию в профиле.</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceOrgEmpty />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="app-page calendar-page--compact">
      <div className="calendar-simple__header">
        <div className="calendar-simple__intro">
          <p className="kicker">Календарь</p>
          <h1>Расписание</h1>
          <p className="period-label">{periodLabel}</p>
        </div>
        <div className="calendar-simple__actions">
          <div className="calendar-simple__actions-main">
            <div className="segmented">
              <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')} type="button">
                Неделя
              </button>
              <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')} type="button">
                Месяц
              </button>
            </div>
            <div className="nav-controls">
              <button onClick={() => navigate(-1)} type="button">Назад</button>
              <button onClick={() => setCursorDate(startOfDay(new Date()))} type="button">Сегодня</button>
              <button onClick={() => navigate(1)} type="button">Вперед</button>
            </div>
          </div>
          <div className="calendar-simple__view-modes" role="tablist" aria-label="Режимы календаря">
            <button
              type="button"
              className={panelMode === 'main' ? 'is-active' : ''}
              onClick={() => setPanelMode('main')}
            >
              Основной
            </button>
            <button
              type="button"
              className={panelMode === 'compact' ? 'is-active' : ''}
              onClick={() => setPanelMode('compact')}
            >
              Компактно
            </button>
          </div>
          {canOpenControlPanel ? (
            <div className="calendar-simple__actions-cta">
              <Link className="ui-button ui-button--primary ui-button--md" href="/control/schedule">
                <span className="ui-button__content">Составить расписание</span>
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {canOpenControlPanel && panelMode === 'main' ? (
        <Card className="schedule-mode-card schedule-mode-card--calendar">
          <CardContent className="schedule-mode-card__body">
            <div className="schedule-mode-card__copy">
              <p className="kicker">Режим 2</p>
              <h2>Точечное редактирование</h2>
              <p>Здесь меняют отдельные опубликованные события. Уведомление отправляется только участникам выбранного события и только если оно касается текущей недели.</p>
            </div>
            <div className="schedule-mode-card__actions">
              <Badge variant="primary">Точечное редактирование</Badge>
              <Link className="ui-button ui-button--ghost ui-button--md" href="/control/schedule">
                <span className="ui-button__content">Перейти к планированию</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {errorText ? <p className="finance-error">{errorText}</p> : null}
      {loading ? <p className="empty-state">Загружаем расписание...</p> : null}

      {!loading && panelMode === 'compact' ? (
        <section className="calendar-compact-mode">
          <div className="calendar-compact-mode__hero">
            <div className="calendar-compact-mode__hero-copy">
              <p className="kicker">Компактный режим</p>
              <h2>{todayEvents.length > 0 ? 'Сегодня под рукой' : 'Ближайшие события без шума'}</h2>
              <p>
                {todayEvents.length > 0
                  ? `На сегодня запланировано ${todayEvents.length} ${todayEvents.length === 1 ? 'событие' : 'события'}. Можно быстро открыть детали или добавить новое.`
                  : 'Показываем ближайшие события, быстрые действия и удобный обзор недели на одном экране.'}
              </p>
            </div>
            {canOpenControlPanel ? (
              <div className="calendar-compact-mode__hero-actions">
                <Button type="button" onClick={() => openComposer(startOfDay(new Date()))}>
                  Быстро добавить на сегодня
                </Button>
                <Button type="button" variant="ghost" onClick={() => openComposer(addDays(startOfDay(new Date()), 1))}>
                  Добавить на завтра
                </Button>
              </div>
            ) : null}
          </div>

          <div className="calendar-compact-mode__quick-days">
            {compactQuickDays.map(({ day, count, firstEvent, isToday }) => (
              <button
                key={`compact-${toDayKey(day)}`}
                type="button"
                className={`calendar-compact-day${isToday ? ' is-today' : ''}`}
                onClick={() => {
                  setCursorDate(startOfDay(day));
                  if (firstEvent) {
                    setSelectedEventId(firstEvent.id);
                    return;
                  }

                  if (count === 0 && canOpenControlPanel) {
                    openComposer(day);
                  }
                }}
              >
                <span className="calendar-compact-day__label">{formatDayName(day)}</span>
                <strong>{weekDayNumberFormat.format(day)}</strong>
                <span className="calendar-compact-day__count">
                  {count > 0 ? `${count} ${count === 1 ? 'событие' : 'события'}` : canOpenControlPanel ? 'Тапните, чтобы добавить' : 'Свободно'}
                </span>
                {firstEvent ? <small>{firstEvent.title}</small> : null}
              </button>
            ))}
          </div>

          <div className="calendar-compact-mode__columns">
            <Card className="calendar-compact-section">
              <CardContent className="calendar-compact-section__body">
                <div className="calendar-compact-section__head">
                  <strong>Сегодня</strong>
                  <span>{todayEvents.length > 0 ? `${todayEvents.length} в работе` : 'Свободно'}</span>
                </div>
                <div className="calendar-compact-section__list">
                  {todayEvents.length > 0 ? (
                    todayEvents.map((event) => renderTheatreEvent(event))
                  ) : (
                    <div className="calendar-compact-section__empty">
                      {canOpenControlPanel ? 'Можно быстро добавить событие на сегодня.' : 'На сегодня событий нет.'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="calendar-compact-section">
              <CardContent className="calendar-compact-section__body">
                <div className="calendar-compact-section__head">
                  <strong>Ближайшее</strong>
                  <span>Следующие 6 событий</span>
                </div>
                <div className="calendar-compact-section__list">
                  {compactUpcomingEvents.length > 0 ? (
                    compactUpcomingEvents.map((event) => (
                      <button
                        key={`compact-upcoming-${event.id}`}
                        type="button"
                        className="calendar-upcoming-item"
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        <div>
                          <strong>{event.title}</strong>
                          <span>{typeLabel[event.type]}</span>
                        </div>
                        <small>
                          {weekdayLongFormat.format(new Date(event.startsAt))} · {getEventScheduleRange(event)}
                        </small>
                      </button>
                    ))
                  ) : (
                    <div className="calendar-compact-section__empty">Пока нет будущих событий.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      {!loading && panelMode === 'main' && viewMode === 'month' ? (
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
              const canCreateOnDay = canOpenControlPanel && items.length === 0;

              return (
                <article
                  key={key}
                  className={`month-cell${isOutside ? ' outside' : ''}${isToday ? ' today' : ''}${canCreateOnDay ? ' is-interactive' : ''}`}
                  onClick={canCreateOnDay ? () => openComposer(day) : undefined}
                  role={canCreateOnDay ? 'button' : undefined}
                  tabIndex={canCreateOnDay ? 0 : undefined}
                  onKeyDown={
                    canCreateOnDay
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openComposer(day);
                          }
                        }
                      : undefined
                  }
                  aria-label={
                    canCreateOnDay ? `Открыть создание события на ${weekdayLongFormat.format(day)}` : undefined
                  }
                >
                  <div className="month-cell-header">
                    <span>{day.getDate()}</span>
                    <div className="month-cell-header__actions">
                      {items.length > 0 ? (
                        <div className="month-cell__summary" aria-label={`Событий: ${items.length}`}>
                          {items.slice(0, 3).map((item) => (
                            <span
                              key={`${item.id}-dot`}
                              className={`month-cell__dot month-cell__dot--${classifyTheatreLane(item).toLowerCase()}`}
                            />
                          ))}
                          <small>{items.length}</small>
                        </div>
                      ) : null}
                      {isToday ? <small>Сегодня</small> : null}
                    </div>
                  </div>
                  <div className="month-events">
                    {items[0] ? (
                      <p className="month-cell__title-preview" title={items[0].title}>
                        {items[0].title}
                      </p>
                    ) : null}
                    <div className="month-events__list">
                      {items.slice(0, 2).map((item) => renderEventChip(item))}
                    </div>
                    {items.length > 2 ? <p className="more-events">Еще {items.length - 2}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!loading && panelMode === 'main' && viewMode === 'week' ? (
        <>
        <section className="theatre-week-view theatre-week-view--desktop">
          <div className="theatre-week-table">
            <div className="theatre-week-table__header">
              <div className="theatre-week-table__day-heading">Дни</div>
              {theatreLaneMeta.map((lane) => (
                <div key={lane.id} className="theatre-week-table__heading">
                  <span className={`theatre-week-table__heading-icon ${lane.iconClassName}`} aria-hidden="true" />
                  <span>{lane.label}</span>
                </div>
              ))}
            </div>

            {canOpenControlPanel && !weekHasEvents ? (
              <div className="theatre-week-table__empty-week">
                Событий на этой неделе нет - нажмите пустую ячейку, чтобы добавить.
              </div>
            ) : null}

            <div className="theatre-week-table__body">
              {weekDays.map((day) => {
                const dayKey = toDayKey(day);
                const laneEvents = theatreWeekMap.get(dayKey);
                const isToday = isSameDay(day, new Date());
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div key={dayKey} className={`theatre-week-table__row${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}`}>
                    <aside className="theatre-week-table__day">
                      <strong>{formatDayName(day)}</strong>
                      <span className="theatre-week-table__day-meta">{weekDayNumberFormat.format(day)}</span>
                      {isToday ? <small className="theatre-week-table__today-badge">Сегодня</small> : null}
                    </aside>

                    {theatreLaneMeta.map((lane) => {
                      const items = laneEvents?.[lane.id] ?? [];
                      const canCreateInCell = canOpenControlPanel && items.length === 0;

                      return (
                        <div
                          key={`${dayKey}-${lane.id}`}
                          className={`theatre-week-table__cell${canCreateInCell ? ' theatre-week-table__cell--interactive' : ''}`}
                          onClick={canCreateInCell ? () => openComposer(day, lane.id) : undefined}
                          role={canCreateInCell ? 'button' : undefined}
                          tabIndex={canCreateInCell ? 0 : undefined}
                          onKeyDown={
                            canCreateInCell
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openComposer(day, lane.id);
                                  }
                                }
                              : undefined
                          }
                          aria-label={
                            canCreateInCell ? `Открыть создание события на ${weekdayLongFormat.format(day)}` : undefined
                          }
                        >
                          {items.length > 0 ? (
                            <div className="theatre-week-table__events">
                              {items.map((event) => renderTheatreEvent(event))}
                            </div>
                          ) : (
                            <div className="theatre-week-table__empty" aria-hidden="true" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <section className="theatre-week-mobile">
          <div className="theatre-week-mobile__list">
            {mobileWeekDays.map(({ day, dayKey, sections, summary, totalEvents, isToday }) => {
              const canCreateOnDay = canOpenControlPanel && totalEvents === 0;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <article
                  key={`${dayKey}-mobile`}
                  className={`theatre-day-card${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}${totalEvents > 0 ? ' has-events' : ' is-empty'}${canCreateOnDay ? ' is-interactive' : ''}`}
                  onClick={canCreateOnDay ? () => openComposer(day) : undefined}
                  role={canCreateOnDay ? 'button' : undefined}
                  tabIndex={canCreateOnDay ? 0 : undefined}
                  onKeyDown={
                    canCreateOnDay
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openComposer(day);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="theatre-day-card__header">
                    <div className="theatre-day-card__day">
                      <strong>{formatDayName(day)}</strong>
                      <span>{weekDayNumberFormat.format(day)}</span>
                    </div>
                    <div className="theatre-day-card__header-meta">
                      {isToday ? <Badge variant="primary">Сегодня</Badge> : null}
                      {canOpenControlPanel ? (
                        <button
                          type="button"
                          className="theatre-day-card__quick-add"
                          aria-label={`Быстро добавить событие на ${weekdayLongFormat.format(day)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openComposer(day);
                          }}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {summary.length > 0 ? (
                    <div className="theatre-day-card__summary-pills">
                      {summary.map(({ lane }) => (
                        <span
                          key={`${dayKey}-${lane.id}-summary`}
                          className={`theatre-day-card__summary-pill theatre-day-card__summary-pill--${lane.id.toLowerCase()}`}
                        >
                          {lane.mobileLabel}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {sections.length > 0 ? (
                    <div className="theatre-day-card__sections">
                      {sections.map(({ lane, events }) => (
                        <div
                          key={`${dayKey}-${lane.id}-section`}
                          className={`theatre-day-card__section theatre-day-card__section--${lane.id.toLowerCase()}`}
                        >
                          <div className="theatre-day-card__section-head">
                            <strong>{lane.mobileLabel}</strong>
                          </div>
                          <div className="theatre-day-card__timeline">
                            {events.map((event) => renderTheatreEvent(event, { showTypeLabel: false }))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="theatre-day-card__empty" aria-hidden="true" />
                  )}
                </article>
              );
            })}
          </div>
        </section>
        </>
      ) : null}

      <Modal
        open={Boolean(composerState)}
        onClose={closeComposer}
        title={composerEditingEventId ? 'Редактировать событие' : 'Новое событие'}
        description={
          composerState
            ? `${composerEditingEventId ? 'Изменение одного события' : 'Новый слот'} на ${weekdayLongFormat.format(new Date(`${composerState.date}T00:00:00`))}`
            : undefined
        }
        size="lg"
        footer={
          composerState ? (
            <>
              <Button type="button" variant="ghost" onClick={closeComposer} disabled={composerSaving}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void handleComposerSave()} loading={composerSaving}>
                {composerEditingEventId ? 'Сохранить изменения' : 'Добавить событие'}
              </Button>
            </>
          ) : undefined
        }
      >
        {composerState ? (
          <div className="calendar-composer">
            {composerErrorText ? <p className="finance-error">{composerErrorText}</p> : null}

            <div className="resource-form-grid resource-form-grid--double">
              <Select
                label="Тип события"
                value={composerState.kind}
                onChange={(event) => handleComposerKindChange(event.target.value as CalendarComposerKind)}
              >
                {Object.entries(composerKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>

              {composerState.kind === 'PERFORMANCE' ? (
                <Select
                  label="Спектакль"
                  value={composerState.playId}
                  onChange={(event) => handleComposerPlayChange(event.target.value)}
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
                  label="Название"
                  value={composerState.title}
                  onChange={(event) =>
                    setComposerState((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                  placeholder="Например, сбор труппы"
                />
              )}
            </div>

            <div className="resource-form-grid resource-form-grid--triple calendar-composer__timing">
              <Input
                label="Дата"
                type="date"
                value={composerState.date}
                onChange={(event) =>
                  setComposerState((current) =>
                    current ? { ...current, date: event.target.value } : current,
                  )
                }
              />
              <Input
                label="Начало"
                type="time"
                value={composerState.startsAt}
                onChange={(event) =>
                  setComposerState((current) =>
                    current ? { ...current, startsAt: event.target.value } : current,
                  )
                }
              />
              {composerState.kind === 'TOUR' || composerState.location === 'Выезд' ? (
                <Input
                  label="Выезд"
                  type="time"
                  value={composerState.assemblyAt}
                  onChange={(event) =>
                    setComposerState((current) =>
                      current ? { ...current, assemblyAt: event.target.value } : current,
                    )
                  }
                />
              ) : null}
              {composerState.kind === 'PERFORMANCE' ? (
                <div className="calendar-composer__summary">
                  <span>Длительность</span>
                  <strong>{formatDurationLabel(composerDurationMinutes)} по спектаклю</strong>
                </div>
              ) : (
                <Select
                  label="Длительность"
                  value={String(composerState.durationMinutes)}
                  onChange={(event) =>
                    setComposerState((current) =>
                      current
                        ? { ...current, durationMinutes: Number(event.target.value) || defaultDurationByKind.EVENT }
                        : current,
                    )
                  }
                >
                  {composerDurationOptions.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatDurationLabel(minutes)}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="calendar-composer__summary calendar-composer__summary--wide">
              <span>{composerState.kind === 'TOUR' || composerState.location === 'Выезд' ? 'Выезд и окончание' : 'Закончится'}</span>
              <strong>
                {(composerState.kind === 'TOUR' || composerState.location === 'Выезд') && composerState.assemblyAt
                  ? `${composerState.assemblyAt} · ${composerEndsAtLabel ?? '—'}`
                  : composerEndsAtLabel ?? '—'}
              </strong>
            </div>

            <div className="resource-form-grid resource-form-grid--double">
              <Select
                label="Площадка"
                value={composerState.location}
                onChange={(event) =>
                  setComposerState((current) =>
                    current ? { ...current, location: event.target.value as VenueName } : current,
                  )
                }
              >
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>
                    {venueLabelMap[venue]}
                  </option>
                ))}
              </Select>
            </div>

            {composerState.kind === 'PERFORMANCE' ? (
              <Card tone="subtle" className="resource-inline-panel">
                <CardContent className="resource-inline-panel__content">
                  <div className="resource-inline-info">
                    <strong>
                      {composerSelectedPlay
                        ? composerSelectedPlayHasAlternateCast
                          ? 'Состав подставится автоматически по дню'
                          : 'Состав подтянется из карточки спектакля'
                        : 'Сначала выберите спектакль'}
                    </strong>
                    <span>
                      {composerSelectedPlay
                        ? composerSelectedPlayHasAlternateCast
                          ? 'Если в этот день уже есть показы этого спектакля, вся дата будет выровнена на один состав.'
                          : `${mapPlayParticipants(composerSelectedPlay).length} участников будут добавлены автоматически.`
                        : 'После выбора спектакля длительность, площадка и участники подставятся автоматически.'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ParticipantPicker
                participants={participants}
                value={composerState.participantIds}
                onChange={(participantIds) =>
                  setComposerState((current) =>
                    current ? { ...current, participantIds } : current,
                  )
                }
                label="Участники"
                searchPlaceholder="Найти по имени"
              />
            )}

            <label className="ui-field-group">
              <span className="ui-field-group__label">Примечание</span>
              <textarea
                className="ui-field calendar-composer__notes"
                value={composerState.description}
                onChange={(event) =>
                  setComposerState((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                placeholder="Короткая служебная заметка"
                rows={4}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEvent?.title ?? 'Событие'}
        description={selectedEvent ? `${typeLabel[selectedEvent.type]} · ${getEventScheduleRange(selectedEvent)}` : undefined}
        size="lg"
        footer={
          selectedEvent && canOpenControlPanel ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setSelectedEventId(null)} disabled={Boolean(eventActionLoading)}>
                Закрыть
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => openComposerForReplacement(selectedEvent)}
                disabled={Boolean(eventActionLoading)}
              >
                Редактировать
              </Button>
              {selectedEvent.status !== 'CANCELLED' ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleCancelSelectedEvent()}
                  loading={eventActionLoading === 'cancel'}
                >
                  Отменить
                </Button>
              ) : null}
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDeleteSelectedEvent()}
                loading={eventActionLoading === 'delete'}
              >
                Удалить
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedEvent ? (
          <div className="selected-event-modal">
            <div className="resource-card__actions">
              {isVenueName(selectedEvent.location) ? (
                <Badge className={`venue-badge ${venueToneClass[selectedEvent.location as VenueName]}`}>
                  {selectedEvent.location}
                </Badge>
              ) : null}
              <Badge variant={selectedEvent.status === 'CANCELLED' ? 'warning' : 'neutral'}>
                {selectedEvent.status === 'CANCELLED' ? 'Отменено' : 'Активно'}
              </Badge>
            </div>

            <div className="selected-event-panel__participants">
              <strong>Занятые</strong>
              {selectedParticipants.length > 0 ? (
                <div className="selected-event-panel__participant-list">
                  {selectedParticipants.map((participant) => (
                    <Badge key={participant.id} variant="neutral">
                      {participantDisplayName(participant)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p>Состав не указан.</p>
              )}
            </div>

            <p className="selected-event-panel__note">
              Для этого режима уведомления уходят только участникам этого события и только если изменение касается текущей недели.
            </p>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
