'use client';

import { type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  type EventAttendanceStatus,
  type EventRecord,
  type EventStatus,
  type EventType,
  type UpdateEventPayload,
} from '@/app/lib/api/operations';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';

import { ChatPanel } from './chat-panel';
import { PointsIncomePanel } from './points-income-panel';
import { ru } from '../lib/i18n/ru';

type ViewMode = 'week' | 'month';

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

type EventDraft = {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  dateInput: string;
  timeInput: string;
  durationMinutes: number;
  participantCount: number;
  location: string;
};

const weekDayLabels = ru.calendar.weekDayLabels;
const weekHours = Array.from({ length: 14 }, (_, index) => index + 8);

const eventTypeLabels: Record<EventType, string> = ru.calendar.eventTypeLabels;
const statusLabels: Record<EventStatus, string> = ru.calendar.statusLabels;

const monthTitleFormat = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
});

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

const shortDateFormat = new Intl.DateTimeFormat('ru-RU', {
  month: 'short',
  day: 'numeric',
});

const addDays = (date: Date, amount: number): Date => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
};

const addMinutes = (date: Date, amount: number): Date => {
  return new Date(date.getTime() + amount * 60_000);
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

const formatTimeInput = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseDateTimeInput = (dateInput: string, timeInput: string): Date => {
  const [yearRaw, monthRaw, dayRaw] = dateInput.split('-');
  const [hoursRaw, minutesRaw] = timeInput.split(':');

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const toDayKey = (date: Date): string => formatDateInput(date);

const rangeForCursor = (cursorDate: Date, viewMode: ViewMode) => {
  if (viewMode === 'month') {
    const gridStart = startOfMonthGrid(cursorDate);
    const gridEnd = addDays(gridStart, 42);
    return {
      from: addDays(gridStart, -7).toISOString(),
      to: addDays(gridEnd, 7).toISOString(),
    };
  }

  const weekStart = startOfWeek(cursorDate);
  const weekEnd = addDays(weekStart, 7);
  return {
    from: addDays(weekStart, -14).toISOString(),
    to: addDays(weekEnd, 21).toISOString(),
  };
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
  return {
    ...event,
    startsAt: next,
  };
};

const moveEventToWeekSlot = (
  event: CalendarEvent,
  targetDay: Date,
  hour: number,
): CalendarEvent => {
  const next = new Date(targetDay);
  next.setHours(hour, 0, 0, 0);
  return {
    ...event,
    startsAt: next,
  };
};

export function CalendarWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const range = rangeForCursor(cursorDate, viewMode);
      const response = await operationsApi.listEvents({
        organizationId: activeOrganizationId,
        accessToken,
        from: range.from,
        to: range.to,
        limit: 300,
      });

      setEvents(response.map(mapEventRecordToCalendarEvent));
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, cursorDate, viewMode]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    if (!events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
      setDraft(null);
    }
  }, [events, selectedEventId]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      ),
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

  const selectedEvent = selectedEventId
    ? events.find((event) => event.id === selectedEventId) ?? null
    : null;

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    setDraft({
      id: selectedEvent.id,
      title: selectedEvent.title,
      type: selectedEvent.type,
      status: selectedEvent.status,
      dateInput: formatDateInput(selectedEvent.startsAt),
      timeInput: formatTimeInput(selectedEvent.startsAt),
      durationMinutes: selectedEvent.durationMinutes,
      participantCount: selectedEvent.participants.length,
      location: selectedEvent.location ?? '',
    });
  }, [selectedEvent]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') {
      return monthTitleFormat.format(cursorDate);
    }

    const start = weekDays[0];
    const end = weekDays[weekDays.length - 1];
    return `${shortDateFormat.format(start)} - ${shortDateFormat.format(end)}`;
  }, [cursorDate, viewMode, weekDays]);

  const replaceEvent = (updatedEvent: CalendarEvent) => {
    setEvents((current) =>
      current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item)),
    );
  };

  const persistEvent = async (
    baseEvent: CalendarEvent,
    nextEvent: CalendarEvent,
    successMessage: string,
  ) => {
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

  const createQuickEvent = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    const baseDate =
      viewMode === 'week'
        ? new Date(
            weekDays[0].getFullYear(),
            weekDays[0].getMonth(),
            weekDays[0].getDate(),
            9,
            0,
          )
        : new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1, 9, 0);

    setSaving(true);
    setErrorText(null);

    try {
      const created = await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title: ru.calendar.newEventTitle,
          type: 'EVENT',
          status: 'PLANNED',
          startsAt: baseDate.toISOString(),
          endsAt: addMinutes(baseDate, 60).toISOString(),
        },
      });

      const mapped = mapEventRecordToCalendarEvent(created);
      setEvents((current) => [...current, mapped]);
      setSelectedEventId(mapped.id);
      setNoticeText('Событие создано и добавлено в расписание.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать событие.');
    } finally {
      setSaving(false);
    }
  };

  const getDraggedEventId = (event: DragEvent<HTMLElement>): string | null => {
    const transferId = event.dataTransfer.getData('text/calendar-event-id');
    return transferId || draggingEventId;
  };

  const handleDropDay =
    (targetDay: Date) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const eventId = getDraggedEventId(event);

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

  const handleDropWeekSlot =
    (targetDay: Date, hour: number) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const eventId = getDraggedEventId(event);

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

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedEvent || !draft) {
      return;
    }

    const startsAt = parseDateTimeInput(draft.dateInput, draft.timeInput);
    const nextEvent: CalendarEvent = {
      ...selectedEvent,
      title: draft.title.trim() || ru.calendar.untitledEvent,
      type: draft.type,
      status: draft.status,
      startsAt,
      durationMinutes: Math.max(15, draft.durationMinutes),
      location: draft.location.trim() || null,
    };

    void persistEvent(selectedEvent, nextEvent, 'Изменения события сохранены.');
  };

  const applyQuickShift = (minutes: number) => {
    if (!selectedEvent) {
      return;
    }

    const nextEvent = {
      ...selectedEvent,
      startsAt: new Date(selectedEvent.startsAt.getTime() + minutes * 60_000),
    };

    void persistEvent(selectedEvent, nextEvent, 'Время события обновлено.');
  };

  const applyQuickDuration = (minutes: number) => {
    if (!selectedEvent) {
      return;
    }

    const nextEvent = {
      ...selectedEvent,
      durationMinutes: Math.max(15, selectedEvent.durationMinutes + minutes),
    };

    void persistEvent(selectedEvent, nextEvent, 'Длительность события обновлена.');
  };

  const duplicateSelected = async () => {
    if (!selectedEvent || !accessToken || !activeOrganizationId) {
      return;
    }

    setSaving(true);
    setErrorText(null);

    try {
      const startsAt = addMinutes(selectedEvent.startsAt, 60);
      const created = await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title: `${selectedEvent.title} (${ru.calendar.duplicateSuffix})`,
          description: selectedEvent.description ?? undefined,
          type: selectedEvent.type,
          status: selectedEvent.status,
          startsAt: startsAt.toISOString(),
          endsAt: addMinutes(startsAt, selectedEvent.durationMinutes).toISOString(),
          timezone: selectedEvent.timezone ?? undefined,
          location: selectedEvent.location ?? undefined,
          isAllDay: selectedEvent.isAllDay,
          templateId: selectedEvent.templateId ?? undefined,
          participants: selectedEvent.participants.map((participant) => ({
            participantId: participant.participantId,
            templateRoleId: participant.templateRoleId,
            roleName: participant.roleName,
            attendanceStatus: participant.attendanceStatus,
            isRequired: participant.isRequired,
            notes: participant.notes,
          })),
        },
      });

      const mapped = mapEventRecordToCalendarEvent(created);
      setEvents((current) => [...current, mapped]);
      setSelectedEventId(mapped.id);
      setNoticeText('Событие продублировано.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось продублировать событие.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedEvent || !accessToken || !activeOrganizationId) {
      return;
    }

    setSaving(true);
    setErrorText(null);

    try {
      await operationsApi.deleteEvent({
        organizationId: activeOrganizationId,
        accessToken,
        eventId: selectedEvent.id,
      });

      setEvents((current) => current.filter((item) => item.id !== selectedEvent.id));
      setSelectedEventId(null);
      setDraft(null);
      setNoticeText('Событие удалено из активного расписания.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить событие.');
    } finally {
      setSaving(false);
    }
  };

  const renderEventChip = (event: CalendarEvent) => (
    <button
      key={event.id}
      className={`event-chip status-${event.status.toLowerCase()} type-${event.type.toLowerCase()}`}
      draggable
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.setData('text/calendar-event-id', event.id);
        dragEvent.dataTransfer.effectAllowed = 'move';
        setDraggingEventId(event.id);
      }}
      onDragEnd={() => setDraggingEventId(null)}
      onClick={() => setSelectedEventId(event.id)}
      type="button"
    >
      <span className="chip-time">{timeFormat.format(event.startsAt)}</span>
      <span className="chip-title">{event.title}</span>
      <span className="chip-meta">
        {event.durationMinutes} {ru.calendar.minuteShort}
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
    <main className="calendar-page">
      <section className="calendar-shell">
        <header className="calendar-header">
          <div>
            <p className="kicker">{ru.calendar.liveKicker}</p>
            <h1>{ru.calendar.title}</h1>
            <p className="period-label">{periodLabel}</p>
          </div>

          <div className="toolbar">
            <div className="segmented">
              <button
                className={viewMode === 'week' ? 'active' : ''}
                onClick={() => setViewMode('week')}
                type="button"
              >
                {ru.calendar.views.week}
              </button>
              <button
                className={viewMode === 'month' ? 'active' : ''}
                onClick={() => setViewMode('month')}
                type="button"
              >
                {ru.calendar.views.month}
              </button>
            </div>

            <div className="nav-controls">
              <button onClick={() => navigate(-1)} type="button">
                {ru.calendar.navigation.previous}
              </button>
              <button onClick={() => setCursorDate(startOfDay(new Date()))} type="button">
                {ru.calendar.navigation.today}
              </button>
              <button onClick={() => navigate(1)} type="button">
                {ru.calendar.navigation.next}
              </button>
            </div>

            <button className="accent-button" onClick={() => void createQuickEvent()} type="button">
              {saving ? 'Сохраняем...' : ru.calendar.quickEvent}
            </button>
          </div>
        </header>

        {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
        {errorText ? <p className="finance-error">{errorText}</p> : null}
        {loading ? <p className="empty-state">Загружаем живое расписание организации...</p> : null}

        {viewMode === 'month' ? (
          <section className="month-view">
            <div className="month-weekday-row">
              {weekDayLabels.map((day) => (
                <div key={day}>{day}</div>
              ))}
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
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropDay(day)}
                  >
                    <div className="month-cell-header">
                      <span>{day.getDate()}</span>
                      {isToday ? <small>{ru.calendar.todayBadge}</small> : null}
                    </div>
                    <div className="month-events">
                      {items.slice(0, 3).map((item) => renderEventChip(item))}
                      {items.length > 3 ? (
                        <p className="more-events">{ru.calendar.moreEvents(items.length - 3)}</p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
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
                      (item) =>
                        isSameDay(item.startsAt, day) && item.startsAt.getHours() === hour,
                    );

                    return (
                      <div
                        key={`${toDayKey(day)}-${hour}`}
                        className="hour-slot"
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
        )}
      </section>

      <aside className="side-stack">
        <section className="quick-panel">
          <h2>{ru.calendar.quickPanel.title}</h2>
          {!selectedEvent || !draft ? (
            <p className="empty-state">{ru.calendar.quickPanel.emptyState}</p>
          ) : (
            <>
              <form className="quick-form" onSubmit={saveDraft}>
                <label>
                  {ru.calendar.quickPanel.fields.title}
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label>
                  {ru.calendar.quickPanel.fields.type}
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, type: event.target.value as EventType }
                          : current,
                      )
                    }
                  >
                    {Object.entries(eventTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {ru.calendar.quickPanel.fields.status}
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, status: event.target.value as EventStatus }
                          : current,
                      )
                    }
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="row">
                  <label>
                    {ru.calendar.quickPanel.fields.date}
                    <input
                      type="date"
                      value={draft.dateInput}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, dateInput: event.target.value } : current,
                        )
                      }
                    />
                  </label>

                  <label>
                    {ru.calendar.quickPanel.fields.time}
                    <input
                      type="time"
                      value={draft.timeInput}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, timeInput: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                </div>

                <div className="row">
                  <label>
                    {ru.calendar.quickPanel.fields.duration}
                    <input
                      min={15}
                      step={15}
                      type="number"
                      value={draft.durationMinutes}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                durationMinutes: Number(event.target.value) || 15,
                              }
                            : current,
                        )
                      }
                    />
                  </label>

                  <label>
                    {ru.calendar.quickPanel.fields.participants}
                    <input
                      type="number"
                      value={draft.participantCount}
                      disabled
                    />
                  </label>
                </div>

                <label>
                  Локация
                  <input
                    value={draft.location}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, location: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <button className="accent-button full-width" type="submit" disabled={saving}>
                  {saving ? 'Сохраняем...' : ru.calendar.quickPanel.save}
                </button>
              </form>

              <div className="quick-actions">
                <button onClick={() => applyQuickShift(24 * 60)} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.moveForward}
                </button>
                <button onClick={() => applyQuickShift(-24 * 60)} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.moveBackward}
                </button>
                <button onClick={() => applyQuickDuration(15)} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.durationIncrease}
                </button>
                <button onClick={() => applyQuickDuration(-15)} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.durationDecrease}
                </button>
                <button onClick={() => void duplicateSelected()} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.duplicate}
                </button>
                <button className="danger" onClick={() => void deleteSelected()} type="button" disabled={saving}>
                  {ru.calendar.quickPanel.actions.delete}
                </button>
              </div>
            </>
          )}
        </section>

        <PointsIncomePanel
          organizationId={activeOrganizationId}
          accessToken={accessToken}
          lockWorkspace
        />
        <ChatPanel
          organizationId={activeOrganizationId}
          accessToken={accessToken}
          lockWorkspace
        />
      </aside>
    </main>
  );
}
