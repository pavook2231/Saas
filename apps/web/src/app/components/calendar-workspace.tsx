'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { operationsApi, participantDisplayName, type EventRecord, type ParticipantRecord } from '@/app/lib/api/operations';
import { WorkspaceOrgEmpty } from '@/components/features/workspace-org-empty';
import { useActiveWorkspace } from '@/components/features/use-active-workspace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { canAccessControlPanel } from '@/lib/organization-access';
import { isVenueName, venueLabelMap, venueToneClass, type VenueName } from '@/lib/venues';

type ViewMode = 'week' | 'month';
type TheatreLane = 'PERFORMANCE' | 'REHEARSAL' | 'TOUR' | 'OTHER';

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
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

const theatreLaneMeta: Array<{
  id: TheatreLane;
  label: string;
}> = [
  {
    id: 'PERFORMANCE',
    label: 'Спектакли',
  },
  {
    id: 'REHEARSAL',
    label: 'Репетиции',
  },
  {
    id: 'TOUR',
    label: 'Гастроли',
  },
  {
    id: 'OTHER',
    label: 'Прочее',
  },
];

const getEventTimeRange = (event: EventRecord) =>
  `${timeFormat.format(new Date(event.startsAt))} — ${timeFormat.format(new Date(event.endsAt))}`;

const classifyTheatreLane = (event: EventRecord): TheatreLane => {
  if (event.type === 'PERFORMANCE') {
    return 'PERFORMANCE';
  }

  if (event.type === 'REHEARSAL') {
    return 'REHEARSAL';
  }

  const searchableText = `${event.title} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase();
  if (searchableText.includes('гастрол')) {
    return 'TOUR';
  }

  return 'OTHER';
};

export function CalendarWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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

  const renderTheatreEvent = (event: EventRecord) => {
    const venue = isVenueName(event.location) ? event.location : null;
    const timeRange = getEventTimeRange(event);

    return (
      <button
        key={event.id}
        type="button"
        className={`theatre-event${selectedEventId === event.id ? ' is-selected' : ''}${event.status === 'CANCELLED' ? ' is-cancelled' : ''}`}
        onClick={() => setSelectedEventId(event.id)}
      >
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
          <span className="theatre-event__type">{typeLabel[event.type]}</span>
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
        <>
        <section className="theatre-week-view theatre-week-view--desktop">
          <div className="theatre-week-table">
            <div className="theatre-week-table__header">
              <div className="theatre-week-table__day-heading">Дни</div>
              {theatreLaneMeta.map((lane) => (
                <div key={lane.id} className="theatre-week-table__heading">
                  {lane.label}
                </div>
              ))}
            </div>

            <div className="theatre-week-table__body">
              {weekDays.map((day) => {
                const dayKey = toDayKey(day);
                const laneEvents = theatreWeekMap.get(dayKey);
                const isToday = isSameDay(day, new Date());

                return (
                  <div key={dayKey} className={`theatre-week-table__row${isToday ? ' is-today' : ''}`}>
                    <aside className="theatre-week-table__day">
                      <strong>{formatDayName(day)}</strong>
                      <span className="theatre-week-table__day-meta">{weekDayNumberFormat.format(day)}</span>
                      {isToday ? <small className="theatre-week-table__today-badge">Сегодня</small> : null}
                    </aside>

                    {theatreLaneMeta.map((lane) => {
                      const items = laneEvents?.[lane.id] ?? [];

                      return (
                        <div key={`${dayKey}-${lane.id}`} className="theatre-week-table__cell">
                          {items.length > 0 ? (
                            <div className="theatre-week-table__events">
                              {items.map((event) => renderTheatreEvent(event))}
                            </div>
                          ) : (
                            <div className="theatre-week-table__empty">
                              —
                            </div>
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
          {weekDays.map((day) => {
            const dayKey = toDayKey(day);
            const laneEvents = theatreWeekMap.get(dayKey);
            const isToday = isSameDay(day, new Date());
            const populatedLanes = theatreLaneMeta.filter((lane) => (laneEvents?.[lane.id] ?? []).length > 0);

            return (
              <article key={`${dayKey}-mobile`} className={`theatre-day-card${isToday ? ' is-today' : ''}`}>
                <div className="theatre-day-card__header">
                  <div className="theatre-day-card__day">
                    <strong>{formatDayName(day)}</strong>
                    <span>{weekDayNumberFormat.format(day)}</span>
                  </div>
                  {isToday ? <Badge variant="primary">Сегодня</Badge> : null}
                </div>

                {populatedLanes.length > 0 ? (
                  <div className="theatre-day-card__sections">
                    {populatedLanes.map((lane) => (
                      <section key={`${dayKey}-${lane.id}-mobile`} className="theatre-day-card__section">
                        <div className="theatre-day-card__section-head">
                          <strong>{lane.label}</strong>
                          <span>{(laneEvents?.[lane.id] ?? []).length}</span>
                        </div>
                        <div className="theatre-day-card__events">
                          {(laneEvents?.[lane.id] ?? []).map((event) => renderTheatreEvent(event))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="theatre-day-card__empty">На этот день событий нет.</div>
                )}
              </article>
            );
          })}
        </section>
        </>
      ) : null}

      <Modal
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEvent?.title ?? 'Событие'}
        description={selectedEvent ? `${typeLabel[selectedEvent.type]} · ${getEventTimeRange(selectedEvent)}` : undefined}
        size="lg"
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
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
