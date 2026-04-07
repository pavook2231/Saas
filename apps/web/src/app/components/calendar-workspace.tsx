'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { operationsApi, participantDisplayName, type EventRecord, type ParticipantRecord } from '@/app/lib/api/operations';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { canAccessControlPanel } from '@/lib/organization-access';
import { isVenueName, venueToneClass, type VenueName } from '@/lib/venues';

type ViewMode = 'week' | 'month';

const weekHours = Array.from({ length: 14 }, (_, index) => index + 8);
const weekDayLabels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

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
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

export function CalendarWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [playFilter, setPlayFilter] = useState('');
  const [participantFilter, setParticipantFilter] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const canOpenControlPanel = canAccessControlPanel(activeRole);

  const loadCalendar = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setEvents([]);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [eventsResponse, participantsResponse] = await Promise.all([
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
      ]);

      setEvents(eventsResponse);
      setParticipants(participantsResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить расписание.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, cursorDate]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );

  const filteredEvents = useMemo(() => {
    const normalizedPlay = playFilter.trim().toLowerCase();
    const normalizedParticipant = participantFilter.trim().toLowerCase();

    return events.filter((event) => {
      const matchesPlay =
        !normalizedPlay ||
        event.title.toLowerCase().includes(normalizedPlay) ||
        (event.template?.name ?? '').toLowerCase().includes(normalizedPlay);
      const matchesParticipant =
        !normalizedParticipant ||
        event.participants.some((item) => {
          const participant = participantsById.get(item.participantId);
          return participant
            ? participantDisplayName(participant).toLowerCase().includes(normalizedParticipant)
            : false;
        });

      return matchesPlay && matchesParticipant;
    });
  }, [events, participantFilter, participantsById, playFilter]);

  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === selectedEventId) ?? null,
    [filteredEvents, selectedEventId],
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
    const map = new Map<string, EventRecord[]>();

    for (const event of filteredEvents) {
      const key = toDayKey(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }

    return map;
  }, [filteredEvents]);

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

  const renderEventChip = (event: EventRecord) => {
    const venue = isVenueName(event.location) ? event.location : null;

    return (
      <button
        key={event.id}
        type="button"
        className={`event-chip type-${event.type.toLowerCase()}${selectedEventId === event.id ? ' is-selected' : ''}${event.status === 'CANCELLED' ? ' status-cancelled' : ''}`}
        onClick={() => setSelectedEventId(event.id)}
      >
        <span className="chip-time">{timeFormat.format(new Date(event.startsAt))}</span>
        <span className="chip-title">{event.title}</span>
        <span className="chip-meta">
          {typeLabel[event.type]}{venue ? ` · ${venue}` : ''}
        </span>
      </button>
    );
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
        <div>
          <p className="kicker">Календарь</p>
          <h1>Расписание</h1>
          <p className="period-label">{periodLabel}</p>
        </div>
        <div className="calendar-simple__actions">
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
          {canOpenControlPanel ? (
            <Link className="ui-button ui-button--primary ui-button--md" href="/control/schedule">
              <span className="ui-button__content">Составить расписание</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="calendar-simple__utility-grid">
        <Card>
          <CardContent className="calendar-simple__filters">
            <Input
              label="Поиск по спектаклю"
              value={playFilter}
              onChange={(event) => setPlayFilter(event.target.value)}
              placeholder="Название спектакля или события"
            />
            <Input
              label="Поиск по участнику"
              value={participantFilter}
              onChange={(event) => setParticipantFilter(event.target.value)}
              placeholder="Имя участника"
            />
          </CardContent>
        </Card>

        <Card className="calendar-simple__details-card">
          <CardHeader>
            <CardTitle>Событие</CardTitle>
            <CardDescription>Короткая карточка выбранного события.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedEvent ? (
              <div className="resource-empty-inline">
                <strong>Событие не выбрано</strong>
                <p>Нажмите на событие в календаре.</p>
              </div>
            ) : (
              <div className="resource-card__list">
                <div className="resource-inline-info">
                  <strong>{selectedEvent.title}</strong>
                  <span>{typeLabel[selectedEvent.type]} · {timeFormat.format(new Date(selectedEvent.startsAt))}</span>
                </div>
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
                <div className="resource-inline-info">
                  <strong>Состав</strong>
                  <span>
                    {selectedEvent.participants.length > 0
                      ? selectedEvent.participants
                          .map((item) => participantsById.get(item.participantId))
                          .filter((participant): participant is ParticipantRecord => participant !== undefined)
                          .map((participant) => participantDisplayName(participant))
                          .join(', ')
                      : 'Состав не указан'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {errorText ? <p className="finance-error">{errorText}</p> : null}
      {loading ? <p className="empty-state">Загружаем расписание...</p> : null}

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
                <article key={key} className={`month-cell${isOutside ? ' outside' : ''}${isToday ? ' today' : ''}`}>
                  <div className="month-cell-header">
                    <span>{day.getDate()}</span>
                    {isToday ? <small>Сегодня</small> : null}
                  </div>
                  <div className="month-events">
                    {items.slice(0, 3).map((item) => renderEventChip(item))}
                    {items.length > 3 ? <p className="more-events">Еще {items.length - 3}</p> : null}
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
            <div className="time-col-label">Время</div>
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
                  const slotEvents = filteredEvents.filter((item) => {
                    const startsAt = new Date(item.startsAt);
                    return isSameDay(startsAt, day) && startsAt.getHours() === hour;
                  });

                  return (
                    <div key={`${toDayKey(day)}-${hour}`} className="hour-slot">
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
  );
}
