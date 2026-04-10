'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  operationsApi,
  participantDisplayName,
  type ConflictCheckResult,
  type EventHistoryRecord,
  type EventRecord,
  type EventStatus,
  type EventType,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { venueLabelMap, venueOptions, venueToneClass, type VenueName } from '@/lib/venues';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

type ScheduleKind = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT';
type ScheduleRepeatMode = 'NONE' | 'DAILY' | 'WEEKLY';

type ScheduleFormState = {
  kind: ScheduleKind;
  playId: string;
  title: string;
  date: string;
  startsAt: string;
  durationMinutes: number;
  location: VenueName;
  participantIds: string[];
  description: string;
  repeatMode: ScheduleRepeatMode;
  repeatCount: number;
};

type SaveIntent = 'PLANNED' | 'DRAFT';

type SaveOptions = {
  intent: SaveIntent;
  openCalendar?: boolean;
  keepForm?: boolean;
};

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'В расписании',
  CONFIRMED: 'Подтверждено',
  COMPLETED: 'Завершено',
  CANCELLED: 'Отменено',
};

const repeatModeLabels: Record<ScheduleRepeatMode, string> = {
  NONE: 'Без повтора',
  DAILY: 'Каждый день',
  WEEKLY: 'Каждую неделю',
};

const defaultDurationByKind: Record<ScheduleKind, number> = {
  PERFORMANCE: 120,
  REHEARSAL: 120,
  EVENT: 120,
};

const techCrewPattern = /(тех|звук|свет|костюм|реквиз|бутафор|монтаж|сцена|освет|гример|машинист)/i;

const todayDate = () => new Date().toISOString().slice(0, 10);
const plusHoursTime = (hours: number) => {
  const date = new Date();
  date.setHours(date.getHours() + hours, 0, 0, 0);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const initialFormState: ScheduleFormState = {
  kind: 'EVENT',
  playId: '',
  title: '',
  date: todayDate(),
  startsAt: plusHoursTime(0),
  durationMinutes: defaultDurationByKind.EVENT,
  location: 'БЗ',
  participantIds: [],
  description: '',
  repeatMode: 'NONE',
  repeatCount: 2,
};

const toIso = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
};

const plusMinutesIso = (iso: string, minutes: number) => {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
};

const durationBetweenIsoMinutes = (startsAt: string, endsAt: string) =>
  Math.max(15, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));

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

const formatTimeOnly = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const shiftDate = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const buildRepeatDates = (dateValue: string, mode: ScheduleRepeatMode, count: number) => {
  const safeCount = Math.min(Math.max(count, 2), 12);

  if (mode === 'NONE') {
    return [dateValue];
  }

  return Array.from({ length: safeCount }, (_, index) => {
    if (mode === 'DAILY') {
      return shiftDate(dateValue, index);
    }

    return shiftDate(dateValue, index * 7);
  });
};

const formatEventTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatHistoryTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const mapPlayParticipants = (play: TemplateRecord) =>
  Array.from(new Set(play.roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId))));

const eventKindFromType = (type: EventType): ScheduleKind => {
  if (type === 'PERFORMANCE') {
    return 'PERFORMANCE';
  }

  if (type === 'REHEARSAL') {
    return 'REHEARSAL';
  }

  return 'EVENT';
};

const actorDisplayName = (actor: EventHistoryRecord['actor']) => {
  if (!actor) {
    return 'Система';
  }

  const name = [actor.lastName, actor.firstName].filter(Boolean).join(' ').trim();
  return name || actor.email || 'Система';
};

const historyLabel = (entry: EventHistoryRecord) => {
  if (entry.action === 'event.created') {
    return 'Создано';
  }

  if (entry.action === 'event.updated') {
    return 'Изменено';
  }

  if (entry.action === 'event.archived') {
    return 'Удалено';
  }

  if (entry.action === 'event.participants.updated') {
    return 'Обновлен состав';
  }

  return entry.description || entry.action;
};

const extractTechCrewIds = (items: ParticipantRecord[]) =>
  items
    .filter((participant) => {
      const haystack = [
        participant.displayName,
        participant.notes,
        participant.email,
        participant.firstName,
        participant.lastName,
      ]
        .filter(Boolean)
        .join(' ');

      return techCrewPattern.test(haystack);
    })
    .map((participant) => participant.id);

const mapEventToForm = (event: EventRecord): ScheduleFormState => ({
  kind: eventKindFromType(event.type),
  playId: event.templateId ?? '',
  title: event.type === 'PERFORMANCE' ? event.template?.name ?? event.title : event.title,
  date: event.startsAt.slice(0, 10),
  startsAt: new Date(event.startsAt).toISOString().slice(11, 16),
  durationMinutes: durationBetweenIsoMinutes(event.startsAt, event.endsAt),
  location: venueOptions.includes(event.location as VenueName) ? (event.location as VenueName) : 'БЗ',
  participantIds: event.participants.map((item) => item.participantId),
  description: event.description ?? '',
  repeatMode: 'NONE',
  repeatCount: 2,
});

export function ControlScheduleWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState<ScheduleFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingEventId, setProcessingEventId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [history, setHistory] = useState<EventHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const [filterLocation, setFilterLocation] = useState<'ALL' | VenueName>('ALL');
  const [filterParticipantId, setFilterParticipantId] = useState('');
  const [lastSavedEvents, setLastSavedEvents] = useState<EventRecord[]>([]);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Расписание',
    errorTitle: 'Расписание',
  });

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
          limit: 100,
          type: 'PERFORMANCE',
          isActive: true,
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 300,
        }),
        operationsApi.listEvents({
          organizationId: activeOrganizationId,
          accessToken,
          from: shiftDate(todayDate(), -7),
          limit: 80,
          includeDrafts: true,
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
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const playId = searchParams.get('playId');

    if (!playId) {
      return;
    }

    const play = plays.find((item) => item.id === playId);
    if (!play) {
      return;
    }

    setForm((current) => ({
      ...current,
      kind: 'PERFORMANCE',
      playId: play.id,
      title: play.name,
      location: venueOptions.includes(play.location as VenueName) ? (play.location as VenueName) : current.location,
      participantIds: mapPlayParticipants(play),
    }));
  }, [plays, searchParams]);

  const playOptions = useMemo(() => plays.map((play) => ({ id: play.id, name: play.name })), [plays]);
  const selectedPlay = useMemo(
    () => plays.find((play) => play.id === form.playId) ?? null,
    [form.playId, plays],
  );
  const selectedParticipants = useMemo(
    () => participants.filter((participant) => form.participantIds.includes(participant.id)),
    [participants, form.participantIds],
  );
  const troupeIds = useMemo(() => participants.map((participant) => participant.id), [participants]);
  const primaryCastIds = useMemo(() => (selectedPlay ? mapPlayParticipants(selectedPlay) : []), [selectedPlay]);
  const techCrewIds = useMemo(() => extractTechCrewIds(participants), [participants]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const computedEndsAtIso = useMemo(() => {
    if (!form.date || !form.startsAt) {
      return null;
    }

    const startsAtIso = toIso(form.date, form.startsAt);
    const durationMinutes =
      form.kind === 'PERFORMANCE'
        ? selectedPlay?.durationMinutes ?? defaultDurationByKind.PERFORMANCE
        : form.durationMinutes;

    return plusMinutesIso(startsAtIso, Math.max(durationMinutes, 15));
  }, [form.date, form.durationMinutes, form.kind, form.startsAt, selectedPlay]);

  const effectiveDurationMinutes = useMemo(
    () =>
      form.kind === 'PERFORMANCE'
        ? selectedPlay?.durationMinutes ?? defaultDurationByKind.PERFORMANCE
        : form.durationMinutes,
    [form.durationMinutes, form.kind, selectedPlay],
  );

  const computedEndsAtLabel = useMemo(
    () => (computedEndsAtIso ? formatTimeOnly(computedEndsAtIso) : null),
    [computedEndsAtIso],
  );

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (filterDate && event.startsAt.slice(0, 10) !== filterDate) {
          return false;
        }

        if (filterLocation !== 'ALL' && event.location !== filterLocation) {
          return false;
        }

        if (filterParticipantId && !event.participants.some((item) => item.participantId === filterParticipantId)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [events, filterDate, filterLocation, filterParticipantId]);

  useEffect(() => {
    if (!selectedEventId) {
      setHistory([]);
      return;
    }

    if (!accessToken || !activeOrganizationId) {
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);

    void operationsApi
      .listEventHistory({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: selectedEventId,
      })
      .then((response) => {
        if (!cancelled) {
          setHistory(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeOrganizationId, selectedEventId]);

  useEffect(() => {
    if (!accessToken || !activeOrganizationId || !form.date || !form.startsAt || !computedEndsAtIso || form.participantIds.length === 0) {
      setConflicts(null);
      return;
    }

    const startsAtIso = toIso(form.date, form.startsAt);

    if (new Date(computedEndsAtIso) <= new Date(startsAtIso)) {
      setConflicts(null);
      return;
    }

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
        .then((response) => {
          setConflicts(response);
        })
        .catch(() => {
          setConflicts(null);
        })
        .finally(() => {
          setCheckingConflicts(false);
        });
    }, 250);

    return () => {
      abortController.abort();
      window.clearTimeout(timeout);
      setCheckingConflicts(false);
    };
  }, [accessToken, activeOrganizationId, computedEndsAtIso, editingEventId, form.date, form.participantIds, form.startsAt]);

  const resetForm = useCallback((keepDate = true) => {
    setForm((current) => ({
      ...initialFormState,
      date: keepDate ? current.date : initialFormState.date,
      startsAt: keepDate ? current.startsAt : initialFormState.startsAt,
    }));
    setEditingEventId(null);
    setConflicts(null);
  }, []);

  const handleKindChange = (kind: ScheduleKind) => {
    setForm((current) => ({
      ...current,
      kind,
      playId: kind === 'PERFORMANCE' ? current.playId : '',
      title: kind === 'PERFORMANCE' ? current.title : current.title,
      durationMinutes:
        kind === 'PERFORMANCE'
          ? current.durationMinutes
          : defaultDurationByKind[kind],
    }));
  };

  const handlePlayChange = (playId: string) => {
    const play = plays.find((item) => item.id === playId);

    setForm((current) => ({
      ...current,
      playId,
      title: play?.name ?? '',
      location: venueOptions.includes(play?.location as VenueName) ? (play?.location as VenueName) : current.location,
      participantIds: play ? mapPlayParticipants(play) : [],
    }));
  };

  const applyPlayTemplate = () => {
    if (!selectedPlay) {
      return;
    }

    setForm((current) => ({
      ...current,
      title: selectedPlay.name,
      location: venueOptions.includes(selectedPlay.location as VenueName)
        ? (selectedPlay.location as VenueName)
        : current.location,
      participantIds: mapPlayParticipants(selectedPlay),
    }));
    setNoticeText(`Состав и площадка подставлены из спектакля «${selectedPlay.name}».`);
  };

  const applyParticipantGroup = (group: 'troupe' | 'cast' | 'tech') => {
    const ids =
      group === 'troupe'
        ? troupeIds
        : group === 'cast'
          ? primaryCastIds
          : techCrewIds;

    if (ids.length === 0) {
      setErrorText(group === 'tech' ? 'Для техслужбы пока нет отмеченных участников.' : 'Группа пока пустая.');
      return;
    }

    setForm((current) => ({
      ...current,
      participantIds: Array.from(new Set([...current.participantIds, ...ids])),
    }));

    const label = group === 'troupe' ? 'Вся труппа' : group === 'cast' ? 'Основной состав' : 'Техслужба';
    setNoticeText(`В состав добавлена группа «${label}».`);
  };

  const loadEventIntoForm = (event: EventRecord, duplicate = false) => {
    setForm(mapEventToForm(event));
    setEditingEventId(duplicate ? null : event.id);
    setSelectedEventId(event.id);
    setLastSavedEvents([]);
    setNoticeText(duplicate ? `Подготовили копию события «${event.title}».` : `Событие «${event.title}» открыто для редактирования.`);
  };

  const buildBasePayload = (dateValue: string, status: EventStatus) => {
    const startsAtIso = toIso(dateValue, form.startsAt);
    const endsAtIso =
      form.kind === 'PERFORMANCE'
        ? plusMinutesIso(startsAtIso, selectedPlay?.durationMinutes ?? defaultDurationByKind.PERFORMANCE)
        : plusMinutesIso(startsAtIso, Math.max(form.durationMinutes, 15));

    if (new Date(endsAtIso) <= new Date(startsAtIso)) {
      throw new Error('Время окончания должно быть позже времени начала.');
    }

    const payloadType: EventType = form.kind === 'EVENT' ? 'EVENT' : form.kind;
    const title = form.kind === 'PERFORMANCE'
      ? plays.find((play) => play.id === form.playId)?.name ?? ''
      : form.title.trim();

    if (!title) {
      throw new Error('Укажите название события или выберите спектакль.');
    }

    return {
      title,
      type: payloadType,
      status,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      location: form.location,
      description: form.description.trim() || undefined,
      templateId: form.kind === 'PERFORMANCE' ? form.playId || undefined : undefined,
      participants: form.participantIds.map((participantId) => ({
        participantId,
        isRequired: true,
      })),
    };
  };

  const upsertEvent = (next: EventRecord) => {
    setEvents((current) => {
      const exists = current.some((item) => item.id === next.id);
      const merged = exists
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current];

      return merged.sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
    });
  };

  const handleSave = async ({ intent, openCalendar = false, keepForm = false }: SaveOptions) => {
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
        setLastSavedEvents([updated]);
        setSelectedEventId(updated.id);
        setNoticeText(intent === 'DRAFT' ? `Черновик «${updated.title}» сохранен.` : `Событие «${updated.title}» обновлено.`);

        if (!keepForm) {
          resetForm();
        }

        if (openCalendar) {
          router.push(`/calendar?eventId=${updated.id}`);
        }

        return;
      }

      const repeatDates = buildRepeatDates(form.date, form.repeatMode, form.repeatCount);
      const createdEvents: EventRecord[] = [];

      for (const dateValue of repeatDates) {
        const created = await operationsApi.createEvent({
          organizationId: activeOrganizationId,
          accessToken,
          payload: buildBasePayload(dateValue, intent === 'DRAFT' ? 'DRAFT' : 'PLANNED'),
        });

        createdEvents.push(created);
      }

      setEvents((current) => [...createdEvents, ...current].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()));
      setLastSavedEvents(createdEvents);
      setSelectedEventId(createdEvents[0]?.id ?? null);
      setNoticeText(
        intent === 'DRAFT'
          ? createdEvents.length > 1
            ? `Сохранено ${createdEvents.length} черновиков.`
            : `Черновик «${createdEvents[0]?.title ?? 'событие'}» сохранен.`
          : createdEvents.length > 1
            ? `События добавлены: ${createdEvents.length}.`
            : `Событие «${createdEvents[0]?.title ?? 'событие'}» добавлено.`,
      );

      if (!keepForm) {
        resetForm();
      }

      if (openCalendar && createdEvents[0]) {
        router.push(`/calendar?eventId=${createdEvents[0].id}`);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить событие.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveToDraft = async (event: EventRecord) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setProcessingEventId(event.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: event.id,
        payload: {
          status: 'DRAFT',
        },
      });

      upsertEvent(updated);
      setSelectedEventId(updated.id);
      setNoticeText(`Событие «${event.title}» снято с публикации.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось перевести событие в черновик.');
    } finally {
      setProcessingEventId(null);
    }
  };

  const handlePublishEvent = async (event: EventRecord) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setProcessingEventId(event.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: event.id,
        payload: {
          status: 'PLANNED',
        },
      });

      upsertEvent(updated);
      setSelectedEventId(updated.id);
      setNoticeText(`Событие «${event.title}» опубликовано.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось опубликовать событие.');
    } finally {
      setProcessingEventId(null);
    }
  };

  const handleCancelEvent = async (event: EventRecord) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    if (!window.confirm(`Отменить событие «${event.title}»?`)) {
      return;
    }

    setProcessingEventId(event.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      const updated = await operationsApi.updateEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: event.id,
        payload: {
          status: 'CANCELLED',
        },
      });

      upsertEvent(updated);
      setSelectedEventId(updated.id);
      setNoticeText(`Событие «${event.title}» отменено.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отменить событие.');
    } finally {
      setProcessingEventId(null);
    }
  };

  const handleDeleteEvent = async (event: EventRecord) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    if (!window.confirm(`Удалить событие «${event.title}» из расписания?`)) {
      return;
    }

    setProcessingEventId(event.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      await operationsApi.deleteEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: event.id,
      });

      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (selectedEventId === event.id) {
        setSelectedEventId(null);
      }
      setNoticeText(`Событие «${event.title}» удалено из расписания.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить событие.');
    } finally {
      setProcessingEventId(null);
    }
  };

  const statusVariant = (status: EventStatus) => {
    if (status === 'CANCELLED') {
      return 'warning' as const;
    }

    if (status === 'DRAFT') {
      return 'neutral' as const;
    }

    if (status === 'CONFIRMED' || status === 'COMPLETED') {
      return 'success' as const;
    }

    return 'primary' as const;
  };

  return (
    <ManagementShell title="Составить расписание" description="События, состав, черновики и публикация без лишней перегрузки.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="page-grid page-grid--two schedule-layout">
        <Card className="schedule-form-card">
          <CardHeader>
            <CardTitle>{editingEventId ? 'Редактирование события' : 'Новое событие'}</CardTitle>
            <CardDescription>
              Сначала тип, время и площадка. Потом состав и примечание.
            </CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
            {lastSavedEvents.length > 0 ? (
              <div className="schedule-success-card">
                <div>
                  <strong>{lastSavedEvents.length > 1 ? `Создано ${lastSavedEvents.length} событий` : 'Событие сохранено'}</strong>
                  <p>
                    {lastSavedEvents.length > 1
                      ? `${lastSavedEvents[0]?.title ?? 'Событие'} и повторы уже в расписании.`
                      : `«${lastSavedEvents[0]?.title ?? 'Событие'}» уже в системе.`}
                  </p>
                </div>
                <div className="schedule-success-actions">
                  {lastSavedEvents[0] ? (
                    <Link className="ui-button ui-button--ghost ui-button--sm" href={`/calendar?eventId=${lastSavedEvents[0].id}`}>
                      <span className="ui-button__content">Открыть в календаре</span>
                    </Link>
                  ) : null}
                  {lastSavedEvents[0] ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => loadEventIntoForm(lastSavedEvents[0], true)}>
                      Добавить ещё похожее
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="control-kind-row">
              {([
                ['PERFORMANCE', 'Спектакль'],
                ['REHEARSAL', 'Репетиция'],
                ['EVENT', 'Другое'],
              ] as const).map(([kind, label]) => (
                <Button
                  key={kind}
                  type="button"
                  variant={form.kind === kind ? 'primary' : 'ghost'}
                  onClick={() => handleKindChange(kind)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {form.kind === 'PERFORMANCE' ? (
              <div className="schedule-inline-actions">
                <Select
                  label="Спектакль"
                  value={form.playId}
                  onChange={(event) => handlePlayChange(event.target.value)}
                >
                  <option value="">Выберите спектакль</option>
                  {playOptions.map((play) => (
                    <option key={play.id} value={play.id}>
                      {play.name}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" size="sm" onClick={applyPlayTemplate} disabled={!selectedPlay}>
                  Заполнить по спектаклю
                </Button>
              </div>
            ) : (
              <Input
                label="Название"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={form.kind === 'REHEARSAL' ? 'Репетиция состава' : 'Сбор, встреча или другое событие'}
              />
            )}

            <div className="resource-form-grid resource-form-grid--double">
              <Input
                label="Дата"
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
              />
              <Select
                label="Площадка"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value as VenueName }))}
              >
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>
                    {venueLabelMap[venue]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="resource-form-grid resource-form-grid--double schedule-timing-grid">
              <Input
                label="Начало"
                type="time"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
              />
              <div className="schedule-time-summary" aria-live="polite">
                <div className="schedule-time-summary__item">
                  <span>Длительность</span>
                  <strong>
                    {form.kind === 'PERFORMANCE'
                      ? `${formatDurationLabel(effectiveDurationMinutes)} по спектаклю`
                      : formatDurationLabel(effectiveDurationMinutes)}
                  </strong>
                </div>
                <div className="schedule-time-summary__item">
                  <span>Закончится</span>
                  <strong>{computedEndsAtLabel ?? '—'}</strong>
                </div>
              </div>
            </div>

            {!editingEventId ? (
              <div className="resource-form-grid resource-form-grid--double">
                <Select
                  label="Повтор"
                  value={form.repeatMode}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    repeatMode: event.target.value as ScheduleRepeatMode,
                  }))}
                >
                  {Object.entries(repeatModeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
                <Input
                  label="Сколько раз"
                  type="number"
                  min={2}
                  max={12}
                  value={String(form.repeatCount)}
                  disabled={form.repeatMode === 'NONE'}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    repeatCount: Number(event.target.value) || 2,
                  }))}
                />
              </div>
            ) : null}

            <div className="schedule-participant-block">
              <div className="schedule-participant-head">
                <div>
                  <strong>Состав участников</strong>
                  <p>{selectedParticipants.length > 0 ? `Выбрано ${selectedParticipants.length}` : 'Пока никого не выбрали'}</p>
                </div>
                <div className="schedule-quick-groups">
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyParticipantGroup('troupe')}>
                    Вся труппа
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyParticipantGroup('cast')} disabled={primaryCastIds.length === 0}>
                    Основной состав
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyParticipantGroup('tech')} disabled={techCrewIds.length === 0}>
                    Техслужба
                  </Button>
                </div>
              </div>

              <ParticipantPicker
                participants={participants}
                value={form.participantIds}
                onChange={(participantIds) => setForm((current) => ({ ...current, participantIds }))}
                label="Участники"
                searchPlaceholder="Найти по имени или фамилии"
              />

              {selectedParticipants.length > 0 ? (
                <div className="schedule-selected-participants">
                  {selectedParticipants.map((participant) => (
                    <div key={participant.id} className="schedule-selected-person">
                      <Avatar size="sm" name={participantDisplayName(participant)} />
                      <div>
                        <strong>{participantDisplayName(participant)}</strong>
                        <span>{participant.userId ? 'С аккаунтом' : 'Без аккаунта'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="ui-field-group">
              <span className="ui-field-group__label">Примечание</span>
              <textarea
                className="ui-field schedule-notes-field"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Служебная информация, особые условия, заметки по составу или площадке"
                rows={4}
              />
            </label>

            <div className="schedule-form-actions">
              <Button type="button" onClick={() => void handleSave({ intent: 'PLANNED' })} loading={saving}>
                {editingEventId ? 'Сохранить изменения' : 'Добавить в расписание'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void handleSave({ intent: 'PLANNED', openCalendar: true })} disabled={saving}>
                Создать и открыть в календаре
              </Button>
              <Button type="button" variant="ghost" onClick={() => void handleSave({ intent: 'DRAFT', keepForm: true })} disabled={saving}>
                Сохранить как черновик
              </Button>
              <Button type="button" variant="ghost" onClick={() => resetForm()} disabled={saving}>
                Очистить форму
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="schedule-sidebar-stack">
          <Card>
            <CardHeader>
              <CardTitle>Контроль и фильтры</CardTitle>
              <CardDescription>Сразу видно конфликты, площадку и состав.</CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              <div className="resource-form-grid resource-form-grid--triple schedule-filter-grid">
                <Input
                  label="На день"
                  type="date"
                  value={filterDate}
                  onChange={(event) => setFilterDate(event.target.value)}
                />
                <Select
                  label="Площадка"
                  value={filterLocation}
                  onChange={(event) => setFilterLocation(event.target.value as 'ALL' | VenueName)}
                >
                  <option value="ALL">Все площадки</option>
                  {venueOptions.map((venue) => (
                    <option key={venue} value={venue}>{venueLabelMap[venue]}</option>
                  ))}
                </Select>
                <Select
                  label="Участник"
                  value={filterParticipantId}
                  onChange={(event) => setFilterParticipantId(event.target.value)}
                >
                  <option value="">Все участники</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>{participantDisplayName(participant)}</option>
                  ))}
                </Select>
              </div>

              <div className="schedule-inline-actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => {
                  setFilterDate('');
                  setFilterLocation('ALL');
                  setFilterParticipantId('');
                }}>
                  Сбросить фильтры
                </Button>
              </div>

              <div className="schedule-conflict-box">
                <div className="schedule-conflict-box__header">
                  <strong>Конфликты</strong>
                  {checkingConflicts ? <Badge variant="neutral">Проверяем</Badge> : null}
                </div>
                {conflicts?.hasConflicts ? (
                  <div className="composer-conflict-card">
                    <strong>{conflicts.summary.conflictedParticipants} участников заняты</strong>
                    <ul className="conflict-list">
                      {conflicts.conflictsByParticipant.slice(0, 4).map((entry) => (
                        <li key={entry.participantId}>
                          <strong>{entry.participantName}</strong>
                          <span>
                            {entry.conflicts[0]?.title ?? 'Есть пересечение'} · {entry.conflicts[0]?.startsAt ? formatEventTime(entry.conflicts[0].startsAt) : 'в это время'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="resource-empty-inline">
                    <strong>{form.participantIds.length > 0 ? 'Пока чисто' : 'Выберите состав'}</strong>
                    <p>{form.participantIds.length > 0 ? 'Пересечений по текущему времени не найдено.' : 'Как только появятся участники, покажем конфликты.'}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ближайшие события</CardTitle>
              <CardDescription>Черновики, публикации и быстрые действия в одном месте.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="empty-state">Загружаем события...</p>
              ) : filteredEvents.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Ничего не найдено</strong>
                  <p>Смените фильтры или создайте новое событие.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {filteredEvents.slice(0, 8).map((event) => {
                    const venue = venueOptions.includes(event.location as VenueName)
                      ? (event.location as VenueName)
                      : null;

                    return (
                      <div
                        key={event.id}
                        className={`profile-item-card schedule-event-card${selectedEventId === event.id ? ' is-selected' : ''}`}
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        <div className="schedule-event-card__main">
                          <div className="schedule-event-card__top">
                            <strong>{event.title}</strong>
                            <span>{formatEventTime(event.startsAt)} — {formatEventTime(event.endsAt)}</span>
                          </div>
                          <div className="schedule-event-card__meta">
                            {venue ? <Badge className={`venue-badge ${venueToneClass[venue]}`} title={venueLabelMap[venue]}>{venue}</Badge> : null}
                            <Badge variant="neutral">{eventTypeLabels[event.type]}</Badge>
                            <Badge variant={statusVariant(event.status)}>{eventStatusLabels[event.status]}</Badge>
                            <span>
                              {event.participants.length > 0
                                ? `${event.participants.length} в составе`
                                : 'Без состава'}
                            </span>
                          </div>
                        </div>
                        <div className="resource-card__actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(actionEvent) => {
                              actionEvent.stopPropagation();
                              loadEventIntoForm(event);
                            }}
                          >
                            Редактировать
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(actionEvent) => {
                              actionEvent.stopPropagation();
                              loadEventIntoForm(event, true);
                            }}
                          >
                            Дублировать
                          </Button>
                          {event.status === 'DRAFT' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(actionEvent) => {
                                actionEvent.stopPropagation();
                                void handlePublishEvent(event);
                              }}
                              loading={processingEventId === event.id}
                            >
                              Опубликовать
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(actionEvent) => {
                                actionEvent.stopPropagation();
                                void handleMoveToDraft(event);
                              }}
                              loading={processingEventId === event.id}
                            >
                              В черновик
                            </Button>
                          )}
                          {event.status !== 'CANCELLED' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(actionEvent) => {
                                actionEvent.stopPropagation();
                                void handleCancelEvent(event);
                              }}
                              loading={processingEventId === event.id}
                            >
                              Отменить
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={(actionEvent) => {
                              actionEvent.stopPropagation();
                              void handleDeleteEvent(event);
                            }}
                            loading={processingEventId === event.id}
                          >
                            Удалить
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Карточка события</CardTitle>
              <CardDescription>Можно открыть событие, увидеть состав и историю без переходов.</CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              {selectedEvent ? (
                <>
                  <div className="schedule-detail-card">
                    <div className="schedule-detail-card__head">
                      <div>
                        <strong>{selectedEvent.title}</strong>
                        <p>{formatEventTime(selectedEvent.startsAt)} — {formatEventTime(selectedEvent.endsAt)}</p>
                      </div>
                      <div className="resource-card__actions">
                        {selectedEvent.location && venueOptions.includes(selectedEvent.location as VenueName) ? (
                          <Badge className={`venue-badge ${venueToneClass[selectedEvent.location as VenueName]}`} title={venueLabelMap[selectedEvent.location as VenueName]}>
                            {selectedEvent.location}
                          </Badge>
                        ) : null}
                        <Badge variant={statusVariant(selectedEvent.status)}>{eventStatusLabels[selectedEvent.status]}</Badge>
                      </div>
                    </div>

                    {selectedEvent.description ? <p className="schedule-detail-card__notes">{selectedEvent.description}</p> : null}

                    <div className="schedule-detail-card__section">
                      <strong>Состав</strong>
                      {selectedEvent.participants.length > 0 ? (
                        <div className="schedule-selected-participants">
                          {selectedEvent.participants.map((item) => (
                            <div key={item.id} className="schedule-selected-person">
                              <Avatar size="sm" name={participantDisplayName(item.participant)} />
                              <div>
                                <strong>{participantDisplayName(item.participant)}</strong>
                                <span>{item.roleName || item.templateRole?.name || 'Без роли'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="resource-empty-inline">Состав пока не задан.</p>
                      )}
                    </div>
                  </div>

                  <div className="schedule-detail-card__section">
                    <strong>История изменений</strong>
                    {historyLoading ? (
                      <p className="empty-state">Загружаем историю...</p>
                    ) : history.length > 0 ? (
                      <div className="schedule-history-list">
                        {history.map((entry) => (
                          <div key={entry.id} className="schedule-history-item">
                            <div>
                              <strong>{historyLabel(entry)}</strong>
                              <span>{actorDisplayName(entry.actor)}</span>
                            </div>
                            <small>{formatHistoryTime(entry.createdAt)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="resource-empty-inline">
                        <strong>История пока пустая</strong>
                        <p>Покажем здесь все изменения по выбранному событию.</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="resource-empty-inline">
                  <strong>Событие не выбрано</strong>
                  <p>Нажмите на событие справа, чтобы открыть состав и историю изменений.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Легенда площадок</CardTitle>
              <CardDescription>Чтобы цветные бейджи читались одинаково у всех.</CardDescription>
            </CardHeader>
            <CardContent className="schedule-legend-grid">
              {venueOptions.map((venue) => (
                <div key={venue} className="schedule-legend-item">
                  <Badge className={`venue-badge ${venueToneClass[venue]}`}>{venue}</Badge>
                  <div>
                    <strong>{venueLabelMap[venue]}</strong>
                    <span>{venue === 'БЗ' ? 'Красный' : venue === 'МЗ' ? 'Зеленый' : venue === 'Реп зал' ? 'Оранжевый' : 'Синий'}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </ManagementShell>
  );
}

