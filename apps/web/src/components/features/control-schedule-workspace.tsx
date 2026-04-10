'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type ConflictCheckResult,
  type EventRecord,
  type EventStatus,
  type EventType,
  type ParticipantRecord,
  type PublishWeekScheduleResult,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { venueLabelMap, venueOptions, type VenueName } from '@/lib/venues';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

type ViewMode = 'month' | 'week';
type ScheduleKind = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT';
type PerformanceCastMode = 'AUTO' | 'CAST_1' | 'CAST_2';
type SaveIntent = 'PLANNED' | 'DRAFT';

type ScheduleFormState = {
  kind: ScheduleKind;
  playId: string;
  title: string;
  date: string;
  startsAt: string;
  assemblyAt: string;
  durationMinutes: number;
  location: VenueName;
  participantIds: string[];
  performanceCastMode: PerformanceCastMode;
  description: string;
};

const alternateRoleSuffixPattern = /\s+\(дубль\)$/i;
const techCrewPattern = /(тех|звук|свет|костюм|реквиз|бутафор|монтаж|сцена|освет|гример|машинист)/i;
const weekDayLabels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const monthTitleFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const weekRangeFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' });
const weekDayNumberFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' });
const weekDayNameFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const weekdayLongFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });

const defaultDurationByKind: Record<ScheduleKind, number> = {
  PERFORMANCE: 120,
  REHEARSAL: 120,
  EVENT: 90,
};

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Выезд',
  EVENT: 'Другое',
  CUSTOM: 'Другое',
};

const initialFormState: ScheduleFormState = {
  kind: 'EVENT',
  playId: '',
  title: '',
  date: new Date().toISOString().slice(0, 10),
  startsAt: '12:00',
  assemblyAt: '',
  durationMinutes: defaultDurationByKind.EVENT,
  location: 'БЗ',
  participantIds: [],
  performanceCastMode: 'AUTO',
  description: '',
};

const addDays = (date: Date, amount: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
};

const startOfDay = (date: Date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfWeek = (date: Date) => {
  const clone = startOfDay(date);
  const day = clone.getDay();
  return addDays(clone, day === 0 ? -6 : 1 - day);
};

const startOfMonthGrid = (date: Date) => startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const getWeekBoundsFromDate = (date: Date) => {
  const start = startOfWeek(date);
  const endInclusive = addDays(start, 6);
  return {
    start,
    startKey: formatDateInput(start),
    endKey: formatDateInput(endInclusive),
    label: `${weekRangeFormat.format(start)} — ${weekRangeFormat.format(endInclusive)}`,
  };
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

const durationBetweenIsoMinutes = (startsAt: string, endsAt: string) =>
  Math.max(15, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));

const formatTimeInputValue = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatDurationLabel = (minutes: number) => {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  if (hours > 0 && restMinutes > 0) return `${hours} ч ${restMinutes} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${restMinutes} мин`;
};

const formatEventTimeRange = (event: EventRecord) =>
  `${timeFormat.format(new Date(event.startsAt))} — ${timeFormat.format(new Date(event.endsAt))}`;

const formatEventScheduleLabel = (event: Pick<EventRecord, 'startsAt' | 'endsAt' | 'assemblyAt'>) => {
  const performanceTime = `${timeFormat.format(new Date(event.startsAt))} — ${timeFormat.format(new Date(event.endsAt))}`;
  return event.assemblyAt ? `Сбор ${formatTimeOnly(event.assemblyAt)} · ${performanceTime}` : performanceTime;
};

const formatTimeOnly = (value: string) => timeFormat.format(new Date(value));

const eventKindFromType = (type: EventType): ScheduleKind => {
  if (type === 'PERFORMANCE') return 'PERFORMANCE';
  if (type === 'REHEARSAL') return 'REHEARSAL';
  return 'EVENT';
};

const pluralize = (count: number, one: string, two: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return two;
  return many;
};

const isAlternateRoleName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return normalized === 'дубль' || alternateRoleSuffixPattern.test(name.trim());
};

const getBaseRoleName = (name: string) => name.replace(alternateRoleSuffixPattern, '').trim() || 'Роль';

const playHasAlternateCast = (play: TemplateRecord | null) =>
  Boolean(play?.roles.some((role) => isAlternateRoleName(role.name)));

const mapPlayParticipants = (play: TemplateRecord, castNumber: 1 | 2 | null = null) => {
  const grouped = new Map<string, { primary: string[]; alternate: string[] }>();

  play.roles.forEach((role) => {
    const key = getBaseRoleName(role.name).toLowerCase();
    const current = grouped.get(key) ?? { primary: [], alternate: [] };
    const participantIds = role.assignments.map((assignment) => assignment.participantId);
    if (isAlternateRoleName(role.name)) {
      current.alternate = participantIds;
    } else {
      current.primary = participantIds;
    }
    grouped.set(key, current);
  });

  return Array.from(
    new Set(
      Array.from(grouped.values()).flatMap((role) =>
        castNumber === 2 ? (role.alternate.length > 0 ? role.alternate : role.primary) : role.primary.length > 0 ? role.primary : role.alternate,
      ),
    ),
  );
};

const predictPerformanceCastNumber = (
  items: EventRecord[],
  templateId: string,
  dateValue: string,
  excludeEventId?: string | null,
): 1 | 2 => {
  const sameDay = items
    .filter(
      (event) =>
        event.id !== excludeEventId &&
        event.templateId === templateId &&
        event.type === 'PERFORMANCE' &&
        event.status !== 'CANCELLED' &&
        event.startsAt.slice(0, 10) === dateValue,
    )
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  if (sameDay[0]?.performanceCastNumber === 1 || sameDay[0]?.performanceCastNumber === 2) {
    return sameDay[0].performanceCastNumber;
  }

  const previousEvent = items
    .filter(
      (event) =>
        event.id !== excludeEventId &&
        event.templateId === templateId &&
        event.type === 'PERFORMANCE' &&
        event.status !== 'CANCELLED' &&
        event.startsAt.slice(0, 10) < dateValue,
    )
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime())[0];

  return previousEvent?.performanceCastNumber === 1 ? 2 : 1;
};

const mapEventToForm = (event: EventRecord): ScheduleFormState => ({
  kind: eventKindFromType(event.type),
  playId: event.templateId ?? '',
  title: event.type === 'PERFORMANCE' ? event.template?.name ?? event.title : event.title,
  date: event.startsAt.slice(0, 10),
  startsAt: formatTimeInputValue(event.startsAt),
  assemblyAt: event.assemblyAt ? formatTimeInputValue(event.assemblyAt) : '',
  durationMinutes: durationBetweenIsoMinutes(event.startsAt, event.endsAt),
  location: venueOptions.includes(event.location as VenueName) ? (event.location as VenueName) : event.type === 'TOUR' ? 'Выезд' : 'БЗ',
  participantIds: event.participants.map((item) => item.participantId),
  performanceCastMode:
    event.type === 'PERFORMANCE' && event.performanceCastLocked && event.performanceCastNumber === 1
      ? 'CAST_1'
      : event.type === 'PERFORMANCE' && event.performanceCastLocked && event.performanceCastNumber === 2
        ? 'CAST_2'
        : 'AUTO',
  description: event.description ?? '',
});

const computeConflictMap = (events: EventRecord[]) => {
  const activeEvents = events.filter((event) => event.status !== 'CANCELLED');
  const conflicts = new Map<string, Set<string>>();

  const addConflict = (eventId: string, reason: string) => {
    const current = conflicts.get(eventId) ?? new Set<string>();
    current.add(reason);
    conflicts.set(eventId, current);
  };

  for (let leftIndex = 0; leftIndex < activeEvents.length; leftIndex += 1) {
    const left = activeEvents[leftIndex];
    const leftStartsAt = new Date(left.startsAt).getTime();
    const leftEndsAt = new Date(left.endsAt).getTime();

    for (let rightIndex = leftIndex + 1; rightIndex < activeEvents.length; rightIndex += 1) {
      const right = activeEvents[rightIndex];
      const rightStartsAt = new Date(right.startsAt).getTime();
      const rightEndsAt = new Date(right.endsAt).getTime();

      if (leftStartsAt >= rightEndsAt || rightStartsAt >= leftEndsAt) {
        continue;
      }

      if (left.location && right.location && left.location === right.location) {
        addConflict(left.id, `Площадка ${left.location} занята`);
        addConflict(right.id, `Площадка ${right.location} занята`);
      }

      const sharedParticipants = left.participants
        .filter((leftParticipant) => right.participants.some((rightParticipant) => rightParticipant.participantId === leftParticipant.participantId))
        .map((participant) => participantDisplayName(participant.participant));

      if (sharedParticipants.length > 0) {
        const listedNames = sharedParticipants.slice(0, 2).join(', ');
        const suffix = sharedParticipants.length > 2 ? ` и ещё ${sharedParticipants.length - 2}` : '';
        const reason = `Пересечение по составу: ${listedNames}${suffix}`;
        addConflict(left.id, reason);
        addConflict(right.id, reason);
      }
    }
  }

  return new Map(Array.from(conflicts.entries()).map(([eventId, values]) => [eventId, Array.from(values)]));
};

const getEventTone = (event: EventRecord) => {
  if (event.type === 'PERFORMANCE') return 'performance';
  if (event.type === 'REHEARSAL') return 'rehearsal';
  return 'event';
};

const countUniqueLinkedParticipantUsers = (events: EventRecord[]) =>
  new Set(
    events.flatMap((event) =>
      event.participants
        .map((participant) => participant.participant.userId)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    ),
  ).size;

export function ControlScheduleWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [cursorDate, setCursorDate] = useState(() => startOfDay(new Date()));
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState<ScheduleFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingWeek, setPublishingWeek] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventActionLoading, setEventActionLoading] = useState<'cancel' | 'delete' | null>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Составить расписание',
    errorTitle: 'Составить расписание',
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 760) {
      setViewMode('week');
    }
  }, []);

  const visibleRange = useMemo(() => {
    if (viewMode === 'month') {
      return {
        start: addDays(startOfMonthGrid(cursorDate), -7),
        end: addDays(startOfMonthGrid(cursorDate), 49),
      };
    }

    return {
      start: addDays(startOfWeek(cursorDate), -7),
      end: addDays(startOfWeek(cursorDate), 14),
    };
  }, [cursorDate, viewMode]);

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setPlays([]);
      setParticipants([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [playResponse, participantResponse, eventResponse] = await Promise.all([
        operationsApi.listTemplates({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 150,
          type: 'PERFORMANCE',
          isActive: true,
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 500,
        }),
        operationsApi.listEvents({
          organizationId: activeOrganizationId,
          accessToken,
          from: visibleRange.start.toISOString(),
          to: visibleRange.end.toISOString(),
          includeDrafts: true,
          limit: 500,
        }),
      ]);

      setPlays(playResponse.filter((play) => play.type === 'PERFORMANCE'));
      setParticipants(participantResponse);
      setEvents(eventResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, visibleRange.end, visibleRange.start]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedPlay = useMemo(() => plays.find((play) => play.id === form.playId) ?? null, [form.playId, plays]);
  const selectedPlayHasAlternateCast = useMemo(() => playHasAlternateCast(selectedPlay), [selectedPlay]);
  const effectivePerformanceCastNumber = useMemo<1 | 2 | null>(() => {
    if (form.kind !== 'PERFORMANCE' || !selectedPlay || !selectedPlayHasAlternateCast) {
      return null;
    }

    if (form.performanceCastMode === 'CAST_1') {
      return 1;
    }

    if (form.performanceCastMode === 'CAST_2') {
      return 2;
    }

    return predictPerformanceCastNumber(events, selectedPlay.id, form.date, editingEventId);
  }, [editingEventId, events, form.date, form.kind, form.performanceCastMode, selectedPlay, selectedPlayHasAlternateCast]);

  const selectedParticipants = useMemo(
    () => participants.filter((participant) => form.participantIds.includes(participant.id)),
    [participants, form.participantIds],
  );
  const troupeIds = useMemo(() => participants.map((participant) => participant.id), [participants]);
  const primaryCastIds = useMemo(() => (selectedPlay ? mapPlayParticipants(selectedPlay, 1) : []), [selectedPlay]);
  const techCrewIds = useMemo(
    () =>
      participants
        .filter((participant) => {
          const haystack = [participant.displayName, participant.notes, participant.email, participant.firstName, participant.lastName]
            .filter(Boolean)
            .join(' ');
          return techCrewPattern.test(haystack);
        })
        .map((participant) => participant.id),
    [participants],
  );

  useEffect(() => {
    if (form.kind !== 'PERFORMANCE' || !selectedPlay) {
      return;
    }

    const nextParticipantIds = mapPlayParticipants(selectedPlay, effectivePerformanceCastNumber);
    setForm((current) => ({
      ...current,
      title: selectedPlay.name,
      location: venueOptions.includes(selectedPlay.location as VenueName) ? (selectedPlay.location as VenueName) : current.location,
      participantIds: nextParticipantIds,
    }));
  }, [effectivePerformanceCastNumber, form.kind, selectedPlay]);

  const effectiveDurationMinutes = useMemo(
    () => (form.kind === 'PERFORMANCE' ? selectedPlay?.durationMinutes ?? defaultDurationByKind.PERFORMANCE : form.durationMinutes),
    [form.durationMinutes, form.kind, selectedPlay],
  );
  const computedEndsAtIso = useMemo(
    () => (form.date && form.startsAt ? plusMinutesIso(toIso(form.date, form.startsAt), Math.max(effectiveDurationMinutes, 15)) : null),
    [effectiveDurationMinutes, form.date, form.startsAt],
  );
  const computedEndsAtLabel = useMemo(() => (computedEndsAtIso ? formatTimeOnly(computedEndsAtIso) : null), [computedEndsAtIso]);

  useEffect(() => {
    if (
      !modalOpen ||
      !accessToken ||
      !activeOrganizationId ||
      !form.date ||
      !form.startsAt ||
      !computedEndsAtIso ||
      form.participantIds.length === 0
    ) {
      setConflicts(null);
      return;
    }

    const startsAtIso =
      form.location === 'Выезд' && form.assemblyAt ? toIso(form.date, form.assemblyAt) : toIso(form.date, form.startsAt);
    const abortController = new AbortController();
    const timeout = window.setTimeout(() => {
      setCheckingConflicts(true);
      void operationsApi
        .checkConflicts({
          organizationId: activeOrganizationId,
          accessToken,
          startsAt: startsAtIso,
          endsAt: computedEndsAtIso,
          participantIds: form.participantIds,
          excludeEventId: editingEventId ?? undefined,
          signal: abortController.signal,
        })
        .then((response) => setConflicts(response))
        .catch(() => setConflicts(null))
        .finally(() => setCheckingConflicts(false));
    }, 250);

    return () => {
      abortController.abort();
      window.clearTimeout(timeout);
      setCheckingConflicts(false);
    };
  }, [
    accessToken,
    activeOrganizationId,
    computedEndsAtIso,
    editingEventId,
    form.assemblyAt,
    form.date,
    form.location,
    form.participantIds,
    form.startsAt,
    modalOpen,
  ]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursorDate]);
  const monthDays = useMemo(() => {
    const start = startOfMonthGrid(cursorDate);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursorDate]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (const event of events) {
      const key = event.startsAt.slice(0, 10);
      const current = map.get(key) ?? [];
      current.push(event);
      current.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
      map.set(key, current);
    }
    return map;
  }, [events]);

  const publicationWeek = useMemo(() => getWeekBoundsFromDate(cursorDate), [cursorDate]);
  const weekDraftEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.status === 'DRAFT' &&
            event.startsAt.slice(0, 10) >= publicationWeek.startKey &&
            event.startsAt.slice(0, 10) <= publicationWeek.endKey,
        )
        .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()),
    [events, publicationWeek.endKey, publicationWeek.startKey],
  );
  const weekNotificationRecipientsCount = useMemo(
    () => countUniqueLinkedParticipantUsers(weekDraftEvents),
    [weekDraftEvents],
  );
  const calendarConflicts = useMemo(() => computeConflictMap(events), [events]);

  const closeModal = () => {
    if (saving || eventActionLoading) return;
    setModalOpen(false);
    setEditingEventId(null);
    setConflicts(null);
    setForm(initialFormState);
    setNoteExpanded(false);
  };

  const openCreateModal = (date: Date) => {
    setEditingEventId(null);
    setForm({
      ...initialFormState,
      date: formatDateInput(date),
      startsAt: isSameDay(date, new Date()) ? `${String(new Date().getHours()).padStart(2, '0')}:00` : '12:00',
    });
    setConflicts(null);
    setNoteExpanded(false);
    setModalOpen(true);
  };

  const openEditModal = (event: EventRecord) => {
    setEditingEventId(event.id);
    setForm(mapEventToForm(event));
    setCursorDate(startOfDay(new Date(event.startsAt)));
    setConflicts(null);
    setNoteExpanded(Boolean(event.description));
    setModalOpen(true);
  };

  const handlePlayChange = (playId: string) => {
    const play = plays.find((item) => item.id === playId);
    setForm((current) => ({
      ...current,
      playId,
      title: play?.name ?? '',
      location: venueOptions.includes(play?.location as VenueName) ? (play?.location as VenueName) : current.location,
      performanceCastMode: 'AUTO',
      participantIds: play ? mapPlayParticipants(play, playHasAlternateCast(play) ? 1 : null) : [],
    }));
  };

  const applyParticipantGroup = (group: 'troupe' | 'cast' | 'tech') => {
    const ids = group === 'troupe' ? troupeIds : group === 'cast' ? primaryCastIds : techCrewIds;
    if (ids.length === 0) {
      setErrorText(group === 'tech' ? 'Для техслужбы пока нет отмеченных участников.' : 'Группа пока пустая.');
      return;
    }
    setForm((current) => ({
      ...current,
      participantIds: Array.from(new Set([...current.participantIds, ...ids])),
    }));
  };

  const buildBasePayload = (dateValue: string, status: EventStatus) => {
    const startsAtIso = toIso(dateValue, form.startsAt);
    const endsAtIso = plusMinutesIso(startsAtIso, Math.max(effectiveDurationMinutes, 15));
    const payloadType: EventType =
      form.kind === 'PERFORMANCE'
        ? 'PERFORMANCE'
        : form.kind === 'REHEARSAL'
          ? 'REHEARSAL'
          : form.location === 'Выезд'
            ? 'TOUR'
            : 'EVENT';
    const title = form.kind === 'PERFORMANCE' ? plays.find((play) => play.id === form.playId)?.name ?? '' : form.title.trim();
    const performanceCastNumber: 1 | 2 | undefined =
      form.kind === 'PERFORMANCE' && form.performanceCastMode === 'CAST_1'
        ? 1
        : form.kind === 'PERFORMANCE' && form.performanceCastMode === 'CAST_2'
          ? 2
          : undefined;

    if (!title) {
      throw new Error('Укажите название события или выберите спектакль.');
    }

    return {
      title,
      type: payloadType,
      status,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      assemblyAt: payloadType === 'TOUR' && form.assemblyAt ? toIso(dateValue, form.assemblyAt) : undefined,
      location: form.location,
      description: form.description.trim() || undefined,
      templateId: form.kind === 'PERFORMANCE' ? form.playId || undefined : undefined,
      performanceCastNumber,
      useAutomaticPerformanceCast:
        form.kind === 'PERFORMANCE' && selectedPlayHasAlternateCast && form.performanceCastMode === 'AUTO'
          ? true
          : undefined,
      participants:
        form.kind === 'PERFORMANCE'
          ? undefined
          : form.participantIds.map((participantId) => ({ participantId, isRequired: true })),
    };
  };

  const upsertEvent = (next: EventRecord) => {
    setEvents((current) => {
      const exists = current.some((item) => item.id === next.id);
      const merged = exists ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current];
      return merged.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    });
  };

  const upsertManyEvents = (nextEvents: EventRecord[]) => {
    setEvents((current) => {
      const byId = new Map(current.map((event) => [event.id, event]));
      nextEvents.forEach((event) => byId.set(event.id, event));
      return Array.from(byId.values()).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    });
  };

  const removeEvent = (eventId: string) => setEvents((current) => current.filter((event) => event.id !== eventId));

  const renderConflictBadge = (event: EventRecord) => {
    const details = calendarConflicts.get(event.id);
    return details && details.length > 0 ? (
      <span className="control-schedule-event__warning" title={details.join('\n')}>
        ⚠
      </span>
    ) : null;
  };

  const renderEventChip = (event: EventRecord, dense = false) => (
    <button
      key={event.id}
      type="button"
      className={`event-chip type-${getEventTone(event)}${event.status === 'CANCELLED' ? ' status-cancelled' : ''}${dense ? ' event-chip--dense' : ''} control-schedule-event-chip${event.status === 'DRAFT' ? ' is-draft' : ''}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        openEditModal(event);
      }}
    >
      <span className="control-schedule-event-chip__top">
        <span className="chip-title">{event.title}</span>
        {renderConflictBadge(event)}
      </span>
      <span className="chip-time">{formatEventScheduleLabel(event)}</span>
      <span className="chip-meta">{event.participants.length} {pluralize(event.participants.length, 'участник', 'участника', 'участников')}</span>
    </button>
  );

  const handleSave = async (intent: SaveIntent) => {
    if (!accessToken || !activeOrganizationId || saving) {
      return;
    }

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      if (editingEventId) {
        const updated = await operationsApi.updateEvent({
          organizationId: activeOrganizationId,
          accessToken,
          eventId: editingEventId,
          payload: buildBasePayload(form.date, intent === 'DRAFT' ? 'DRAFT' : 'PLANNED'),
        });
        upsertEvent(updated);
        setNoticeText(`Событие «${updated.title}» обновлено.`);
        closeModal();
        return;
      }

      const created = await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: buildBasePayload(form.date, intent === 'DRAFT' ? 'DRAFT' : 'PLANNED'),
      });

      upsertEvent(created);
      setNoticeText(
        intent === 'DRAFT'
          ? `Черновик «${created.title}» сохранен.`
          : `Событие «${created.title}» опубликовано.`,
      );
      closeModal();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить событие.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = () => {
    setEditingEventId(null);
    setNoticeText('Подготовили копию события. Теперь можно сохранить ее как новый слот.');
  };

  const handleCancelEvent = async () => {
    if (!editingEventId || !accessToken || !activeOrganizationId) {
      return;
    }

    if (!window.confirm('Отменить это событие?')) {
      return;
    }

    setEventActionLoading('cancel');
    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: editingEventId,
        payload: { status: 'CANCELLED' },
      });
      upsertEvent(updated);
      setNoticeText(`Событие «${updated.title}» отменено.`);
      closeModal();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отменить событие.');
    } finally {
      setEventActionLoading(null);
    }
  };

  const handleDeleteEvent = async () => {
    if (!editingEventId || !accessToken || !activeOrganizationId) {
      return;
    }

    if (!window.confirm('Удалить это событие из расписания?')) {
      return;
    }

    setEventActionLoading('delete');
    try {
      await operationsApi.deleteEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: editingEventId,
      });
      removeEvent(editingEventId);
      setNoticeText('Событие удалено из расписания.');
      closeModal();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить событие.');
    } finally {
      setEventActionLoading(null);
    }
  };

  const handlePublishWeek = async () => {
    if (!accessToken || !activeOrganizationId || publishingWeek || weekDraftEvents.length === 0) {
      return;
    }

    setPublishingWeek(true);
    try {
      const result: PublishWeekScheduleResult = await operationsApi.publishWeekSchedule({
        organizationId: activeOrganizationId,
        accessToken,
        anchorDate: publicationWeek.startKey,
      });
      upsertManyEvents(result.publishedEvents);
      setNoticeText(
        result.notified
          ? `Неделя ${publicationWeek.label} опубликована. Уведомления отправлены ${weekNotificationRecipientsCount} ${pluralize(weekNotificationRecipientsCount, 'участнику', 'участникам', 'участникам')}.`
          : `Неделя ${publicationWeek.label} опубликована, но уведомления участникам не были отправлены.`,
      );
      setPublishModalOpen(false);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось опубликовать неделю.');
    } finally {
      setPublishingWeek(false);
    }
  };

  return (
    <ManagementShell
      title="Составить расписание"
      description="Режим планирования недели: сначала соберите черновики, затем опубликуйте всю неделю одним действием."
    >
      <div className="control-schedule-board">
        <Card className="schedule-mode-card schedule-mode-card--planner">
          <CardContent className="schedule-mode-card__body">
            <div className="schedule-mode-card__copy">
              <p className="kicker">Режим 1</p>
              <h2>Составить расписание</h2>
              <p>Здесь планируют неделю целиком. Уведомления уходят только после массовой публикации недели.</p>
            </div>
            <div className="schedule-mode-card__actions">
              <Badge variant="primary">Массовая публикация</Badge>
              <Link className="ui-button ui-button--ghost ui-button--md" href="/calendar">
                <span className="ui-button__content">Открыть календарь</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="control-schedule-board__toolbar-card">
          <CardContent className="control-schedule-board__toolbar">
            <div className="control-schedule-board__toolbar-main">
              <div className="control-schedule-board__view-switcher" role="tablist" aria-label="Переключение вида">
                <button type="button" className={viewMode === 'month' ? 'is-active' : ''} onClick={() => setViewMode('month')}>
                  Месяц
                </button>
                <button type="button" className={viewMode === 'week' ? 'is-active' : ''} onClick={() => setViewMode('week')}>
                  Неделя
                </button>
              </div>
              <div className="control-schedule-board__nav">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCursorDate((current) => addDays(current, viewMode === 'month' ? -28 : -7))}>
                  Назад
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCursorDate(startOfDay(new Date()))}>
                  Сегодня
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCursorDate((current) => addDays(current, viewMode === 'month' ? 28 : 7))}>
                  Вперёд
                </Button>
              </div>
            </div>

            <div className="control-schedule-board__toolbar-aside">
              <div className="control-schedule-board__period">
                <strong>{viewMode === 'month' ? monthTitleFormat.format(cursorDate) : publicationWeek.label}</strong>
                <span>Соберите события в черновики и опубликуйте неделю одним подтверждением.</span>
              </div>
              <div className="control-schedule-board__publish-actions">
                <Badge
                  variant={weekDraftEvents.length > 0 ? 'warning' : 'success'}
                  className="control-schedule-board__publish-counter"
                >
                  {weekDraftEvents.length > 0
                    ? `Не опубликовано: ${weekDraftEvents.length} ${pluralize(weekDraftEvents.length, 'событие', 'события', 'событий')}`
                    : 'Все события опубликованы'}
                </Badge>
                <Button type="button" onClick={() => setPublishModalOpen(true)} disabled={weekDraftEvents.length === 0}>
                  Опубликовать неделю
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {errorText && !modalOpen ? (
          <Card>
            <CardContent className="resource-empty-inline">
              <strong>Не удалось загрузить расписание</strong>
              <p>{errorText}</p>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="control-schedule-board__skeletons">
            {Array.from({ length: viewMode === 'month' ? 6 : 3 }).map((_, index) => (
              <Card key={`schedule-skeleton-${index}`} className="resource-card resource-card--loading control-schedule-board__skeleton" />
            ))}
          </div>
        ) : viewMode === 'month' ? (
          <Card>
            <CardContent className="month-view control-schedule-board__calendar">
              <div className="month-weekday-row">
                {weekDayLabels.map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="month-grid">
                {monthDays.map((day) => {
                  const dayKey = formatDateInput(day);
                  const items = eventsByDay.get(dayKey) ?? [];
                  const isToday = isSameDay(day, new Date());
                  const isOutside = day.getMonth() !== cursorDate.getMonth();

                  return (
                    <article
                      key={dayKey}
                      className={`month-cell is-interactive${isToday ? ' today' : ''}${isOutside ? ' outside' : ''}`}
                      onClick={() => openCreateModal(day)}
                    >
                      <div className="month-cell-header">
                        <span>{day.getDate()}</span>
                        <div className="month-cell-header__actions">
                          {isToday ? <small>Сегодня</small> : null}
                        </div>
                      </div>
                      <div className="month-events">
                        <div className="month-events__list">
                          {items.slice(0, 3).map((event) => renderEventChip(event, true))}
                        </div>
                        {items.length > 3 ? (
                          <button
                            type="button"
                            className="more-events"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              setCursorDate(startOfDay(day));
                              setViewMode('week');
                            }}
                          >
                            +ещё {items.length - 3}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="week-strip control-schedule-board__week">
            {weekDays.map((day) => {
              const dayKey = formatDateInput(day);
              const items = eventsByDay.get(dayKey) ?? [];
              const isToday = isSameDay(day, new Date());

              return (
                <Card key={dayKey} className={`week-day-card${isToday ? ' today' : ''}`}>
                  <CardContent className="week-day-card__body control-schedule-week-day" onClick={() => openCreateModal(day)}>
                    <div className="week-day-card__header">
                      <div>
                        <span>{weekDayNameFormat.format(day)}</span>
                        <strong>{weekDayNumberFormat.format(day)}</strong>
                      </div>
                      {isToday ? <Badge variant="primary">Сегодня</Badge> : null}
                    </div>

                    {items.length > 0 ? items.map((event) => renderEventChip(event)) : <div className="control-schedule-week-day__empty" aria-hidden="true" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingEventId ? 'Редактировать событие' : 'Новое событие'}
        description={weekdayLongFormat.format(new Date(`${form.date}T00:00:00`))}
        size="md"
        panelClassName="control-schedule-modal__panel"
        footer={
          <div className="control-schedule-modal__footer">
            <div className="control-schedule-modal__footer-side">
              {editingEventId ? (
                <>
                  <Button type="button" variant="ghost" onClick={handleDuplicate} disabled={saving || Boolean(eventActionLoading)}>
                    Дублировать
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void handleCancelEvent()} loading={eventActionLoading === 'cancel'}>
                    Отменить
                  </Button>
                  <Button type="button" variant="danger" onClick={() => void handleDeleteEvent()} loading={eventActionLoading === 'delete'}>
                    Удалить
                  </Button>
                </>
              ) : null}
            </div>
            <div className="control-schedule-modal__footer-side">
              <Button type="button" variant="ghost" onClick={closeModal} disabled={saving || Boolean(eventActionLoading)}>
                Отмена
              </Button>
              <Button type="button" variant="ghost" onClick={() => void handleSave('DRAFT')} loading={saving}>
                Сохранить в черновик
              </Button>
              <Button type="button" onClick={() => void handleSave('PLANNED')} loading={saving}>
                Опубликовать сразу
              </Button>
            </div>
          </div>
        }
      >
        <div className="control-schedule-modal">
          <div className="auth-tabs">
            <button type="button" className={form.kind === 'PERFORMANCE' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, kind: 'PERFORMANCE' }))}>
              Спектакль
            </button>
            <button type="button" className={form.kind === 'REHEARSAL' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, kind: 'REHEARSAL', location: 'Реп зал' }))}>
              Репетиция
            </button>
            <button type="button" className={form.kind === 'EVENT' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, kind: 'EVENT' }))}>
              Другое
            </button>
          </div>
          <div className="control-schedule-modal__grid">
            <div className="control-schedule-modal__field control-schedule-modal__field--full">
              {form.kind === 'PERFORMANCE' ? (
                <Select
                  label="Спектакль"
                  value={form.playId}
                  onChange={(event) => handlePlayChange(event.target.value)}
                >
                  <option value="">Выберите спектакль</option>
                  {plays.map((play) => (
                    <option key={play.id} value={play.id}>
                      {play.name} · {formatDurationLabel(play.durationMinutes)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  label={form.kind === 'REHEARSAL' ? 'Название репетиции' : 'Название'}
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={form.kind === 'REHEARSAL' ? 'Например, прогон второго акта' : 'Например, сбор труппы или другое событие'}
                />
              )}
            </div>

            <div className="control-schedule-modal__field">
              <Input
                label="Дата"
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
            </div>

            <div className="control-schedule-modal__field">
              <Input
                label="Начало"
                type="time"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
              />
            </div>

            {form.location === 'Выезд' ? (
              <div className="control-schedule-modal__field">
                <Input
                  label="Сбор"
                  type="time"
                  value={form.assemblyAt}
                  onChange={(event) => setForm((current) => ({ ...current, assemblyAt: event.target.value }))}
                />
              </div>
            ) : null}

            <div className="control-schedule-modal__field">
              <Input
                label="Продолжительность, мин"
                type="number"
                min={15}
                step={15}
                value={String(effectiveDurationMinutes)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    durationMinutes: Math.max(15, Number(event.target.value) || defaultDurationByKind[current.kind]),
                  }))
                }
                disabled={form.kind === 'PERFORMANCE' && Boolean(selectedPlay)}
              />
            </div>

            <div className="control-schedule-modal__field">
              <Select
                label="Площадка"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value as VenueName }))}
              >
                {venueOptions.map((option) => (
                  <option key={option} value={option}>
                    {venueLabelMap[option]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="control-schedule-modal__field control-schedule-modal__field--full">
              <div className="control-schedule-modal__summary">
                <div>
                  <span>Длительность</span>
                  <strong>{formatDurationLabel(effectiveDurationMinutes)}</strong>
                </div>
                <div>
                  <span>Закончится</span>
                  <strong>{computedEndsAtLabel ?? '—'}</strong>
                </div>
                {form.location === 'Выезд' ? (
                  <div>
                    <span>Сбор</span>
                    <strong>{form.assemblyAt || 'Не указан'}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {form.kind === 'PERFORMANCE' && selectedPlayHasAlternateCast ? (
            <div className="schedule-cast-switcher control-schedule-modal__section">
              <div>
                <strong>Состав дня</strong>
                <p>
                  {form.performanceCastMode === 'AUTO'
                    ? `Автовыбор · сейчас встанет ${effectivePerformanceCastNumber === 2 ? '2 состав' : '1 состав'}`
                    : form.performanceCastMode === 'CAST_1'
                      ? 'Ручной выбор · 1 состав'
                      : 'Ручной выбор · 2 состав'}
                </p>
              </div>
              <div className="schedule-cast-switcher__controls">
                <Button
                  type="button"
                  size="sm"
                  variant={form.performanceCastMode === 'AUTO' ? 'primary' : 'ghost'}
                  onClick={() => setForm((current) => ({ ...current, performanceCastMode: 'AUTO' }))}
                >
                  Авто
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.performanceCastMode === 'CAST_1' ? 'primary' : 'ghost'}
                  onClick={() => setForm((current) => ({ ...current, performanceCastMode: 'CAST_1' }))}
                >
                  1 состав
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.performanceCastMode === 'CAST_2' ? 'primary' : 'ghost'}
                  onClick={() => setForm((current) => ({ ...current, performanceCastMode: 'CAST_2' }))}
                >
                  2 состав
                </Button>
              </div>
            </div>
          ) : null}

          <div className="control-schedule-modal__section control-schedule-modal__participants">
            <div className="control-schedule-modal__section-head">
              <div>
                <strong>Участники</strong>
                <span>
                  {selectedParticipants.length > 0
                    ? `${selectedParticipants.length} ${pluralize(selectedParticipants.length, 'участник', 'участника', 'участников')}`
                    : form.kind === 'PERFORMANCE'
                      ? 'Подтягиваются из карточки спектакля'
                      : 'Пока никого не выбрали'}
                </span>
              </div>
            </div>

            {form.kind === 'PERFORMANCE' ? (
              selectedParticipants.length > 0 ? (
                <div className="control-schedule-modal__chips">
                  {selectedParticipants.map((participant) => (
                    <span key={participant.id} className="control-schedule-modal__chip">
                      {participantDisplayName(participant)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="control-schedule-modal__muted">Выберите спектакль, и состав подставится автоматически.</p>
              )
            ) : (
              <>
                <div className="control-schedule-modal__group-actions">
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyParticipantGroup('troupe')}>
                    Вся труппа
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyParticipantGroup('cast')}>
                    Основной состав
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyParticipantGroup('tech')}>
                    Техслужба
                  </Button>
                </div>

                <ParticipantPicker
                  participants={participants}
                  recentIds={selectedParticipants.map((participant) => participant.id)}
                  value={form.participantIds}
                  onChange={(value) => setForm((current) => ({ ...current, participantIds: value }))}
                />

                {selectedParticipants.length > 0 ? (
                  <div className="control-schedule-modal__chips">
                    {selectedParticipants.map((participant) => (
                      <span key={participant.id} className="control-schedule-modal__chip">
                        {participantDisplayName(participant)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="control-schedule-modal__section">
            <button
              type="button"
              className="control-schedule-modal__disclosure"
              onClick={() => setNoteExpanded((current) => !current)}
            >
              <span>Примечание</span>
              <span>{noteExpanded ? 'Скрыть' : 'Добавить'}</span>
            </button>
            {noteExpanded ? (
              <textarea
                className="control-schedule-modal__textarea"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Особые условия, комментарии для команды, детали по площадке"
                rows={4}
              />
            ) : null}
          </div>

          <div className="control-schedule-modal__section control-schedule-modal__section--status">
            {checkingConflicts ? (
              <p className="control-schedule-modal__muted">Проверяем пересечения по времени, площадке и участникам…</p>
            ) : conflicts?.hasConflicts ? (
              <div className="control-schedule-modal__warning">
                <strong>Есть конфликты</strong>
                <ul>
                  {conflicts.conflictsByParticipant.slice(0, 4).map((entry) => (
                    <li key={entry.participantId}>
                      {entry.participantName}: {entry.conflicts[0]?.reason ?? 'пересечение по времени'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="control-schedule-modal__muted">Пересечений по текущему составу и площадке не найдено.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={publishModalOpen}
        onClose={() => {
          if (!publishingWeek) {
            setPublishModalOpen(false);
          }
        }}
        title="Подтвердить публикацию недели"
        description={publicationWeek.label}
        size="sm"
        footer={
          <div className="control-schedule-modal__footer">
            <div className="control-schedule-modal__footer-side" />
            <div className="control-schedule-modal__footer-side">
              <Button type="button" variant="ghost" onClick={() => setPublishModalOpen(false)} disabled={publishingWeek}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void handlePublishWeek()} loading={publishingWeek} disabled={weekDraftEvents.length === 0}>
                Опубликовать неделю
              </Button>
            </div>
          </div>
        }
      >
        <div className="control-schedule-publish-modal">
          <div className="control-schedule-publish-modal__summary">
            <strong>
              Будет опубликовано {weekDraftEvents.length} {pluralize(weekDraftEvents.length, 'событие', 'события', 'событий')}. Уведомления получат {weekNotificationRecipientsCount} {pluralize(weekNotificationRecipientsCount, 'участник', 'участника', 'участников')}.
            </strong>
            <p>Ниже список событий, которые уйдут в опубликованное расписание.</p>
          </div>
          {weekDraftEvents.length > 0 ? (
            <div className="control-schedule-publish-modal__list">
              {weekDraftEvents.map((event) => (
                <div key={event.id} className="control-schedule-publish-modal__item">
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {weekdayLongFormat.format(new Date(event.startsAt))} · {formatEventTimeRange(event)}
                    </p>
                  </div>
                  <Badge variant="neutral">{eventTypeLabels[event.type]}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="control-schedule-modal__muted">На этой неделе пока нет черновиков для публикации.</p>
          )}
        </div>
      </Modal>
    </ManagementShell>
  );
}

