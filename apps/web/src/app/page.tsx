'use client';

import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { ChatPanel } from './components/chat-panel';
import { PointsIncomePanel } from './components/points-income-panel';

type ViewMode = 'week' | 'month';
type EventType = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT' | 'CUSTOM';
type EventStatus = 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

type CalendarEvent = {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  startsAt: Date;
  durationMinutes: number;
  participants: number;
};

type EventDraft = {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  dateInput: string;
  timeInput: string;
  durationMinutes: number;
  participants: number;
};

const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const weekHours = Array.from({ length: 14 }, (_, index) => index + 8);

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Performance',
  REHEARSAL: 'Rehearsal',
  EVENT: 'Event',
  CUSTOM: 'Custom',
};

const statusLabels: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  PLANNED: 'Planned',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const monthTitleFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

const weekdayLongFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const shortDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
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

const makeEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createInitialEvents = (): CalendarEvent[] => {
  const now = new Date();
  const monday = startOfWeek(now);

  return [
    {
      id: makeEventId(),
      title: 'Stage Rehearsal',
      type: 'REHEARSAL',
      status: 'CONFIRMED',
      startsAt: new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 1,
        11,
        0,
      ),
      durationMinutes: 180,
      participants: 18,
    },
    {
      id: makeEventId(),
      title: 'Premiere Run',
      type: 'PERFORMANCE',
      status: 'PLANNED',
      startsAt: new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 3,
        19,
        0,
      ),
      durationMinutes: 120,
      participants: 25,
    },
    {
      id: makeEventId(),
      title: 'Producer Check-in',
      type: 'EVENT',
      status: 'DRAFT',
      startsAt: new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 4,
        14,
        30,
      ),
      durationMinutes: 45,
      participants: 6,
    },
    {
      id: makeEventId(),
      title: 'Movement Class',
      type: 'CUSTOM',
      status: 'CONFIRMED',
      startsAt: new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 5,
        10,
        0,
      ),
      durationMinutes: 90,
      participants: 14,
    },
  ];
};

export default function HomePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>(() => createInitialEvents());
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

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

  const [draft, setDraft] = useState<EventDraft | null>(null);

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
      participants: selectedEvent.participants,
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

  const navigate = (direction: -1 | 1) => {
    setCursorDate((current) => {
      if (viewMode === 'month') {
        return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      }

      return addDays(current, direction * 7);
    });
  };

  const createQuickEvent = () => {
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

    const nextEvent: CalendarEvent = {
      id: makeEventId(),
      title: 'New Event',
      type: 'EVENT',
      status: 'PLANNED',
      startsAt: baseDate,
      durationMinutes: 60,
      participants: 0,
    };

    setEvents((current) => [...current, nextEvent]);
    setSelectedEventId(nextEvent.id);
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

      setEvents((current) =>
        current.map((item) =>
          item.id === eventId ? moveEventToDay(item, targetDay) : item,
        ),
      );
      setDraggingEventId(null);
    };

  const handleDropWeekSlot =
    (targetDay: Date, hour: number) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const eventId = getDraggedEventId(event);

      if (!eventId) {
        return;
      }

      setEvents((current) =>
        current.map((item) =>
          item.id === eventId ? moveEventToWeekSlot(item, targetDay, hour) : item,
        ),
      );
      setDraggingEventId(null);
    };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft) {
      return;
    }

    const startsAt = parseDateTimeInput(draft.dateInput, draft.timeInput);

    setEvents((current) =>
      current.map((item) =>
        item.id === draft.id
          ? {
              ...item,
              title: draft.title.trim() || 'Untitled Event',
              type: draft.type,
              status: draft.status,
              startsAt,
              durationMinutes: Math.max(15, draft.durationMinutes),
              participants: Math.max(0, draft.participants),
            }
          : item,
      ),
    );
  };

  const applyQuickShift = (minutes: number) => {
    if (!selectedEvent) {
      return;
    }

    setEvents((current) =>
      current.map((item) =>
        item.id === selectedEvent.id
          ? { ...item, startsAt: new Date(item.startsAt.getTime() + minutes * 60_000) }
          : item,
      ),
    );
  };

  const applyQuickDuration = (minutes: number) => {
    if (!selectedEvent) {
      return;
    }

    setEvents((current) =>
      current.map((item) =>
        item.id === selectedEvent.id
          ? { ...item, durationMinutes: Math.max(15, item.durationMinutes + minutes) }
          : item,
      ),
    );
  };

  const duplicateSelected = () => {
    if (!selectedEvent) {
      return;
    }

    const clone: CalendarEvent = {
      ...selectedEvent,
      id: makeEventId(),
      title: `${selectedEvent.title} Copy`,
      startsAt: new Date(selectedEvent.startsAt.getTime() + 60 * 60_000),
    };

    setEvents((current) => [...current, clone]);
    setSelectedEventId(clone.id);
  };

  const deleteSelected = () => {
    if (!selectedEvent) {
      return;
    }

    setEvents((current) => current.filter((item) => item.id !== selectedEvent.id));
    setSelectedEventId(null);
    setDraft(null);
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
      <span className="chip-meta">{event.durationMinutes} min</span>
    </button>
  );

  return (
    <main className="calendar-page">
      <section className="calendar-shell">
        <header className="calendar-header">
          <div>
            <p className="kicker">Live Scheduling</p>
            <h1>Production Calendar</h1>
            <p className="period-label">{periodLabel}</p>
          </div>

          <div className="toolbar">
            <div className="segmented">
              <button
                className={viewMode === 'week' ? 'active' : ''}
                onClick={() => setViewMode('week')}
                type="button"
              >
                Week
              </button>
              <button
                className={viewMode === 'month' ? 'active' : ''}
                onClick={() => setViewMode('month')}
                type="button"
              >
                Month
              </button>
            </div>

            <div className="nav-controls">
              <button onClick={() => navigate(-1)} type="button">
                Prev
              </button>
              <button onClick={() => setCursorDate(startOfDay(new Date()))} type="button">
                Today
              </button>
              <button onClick={() => navigate(1)} type="button">
                Next
              </button>
            </div>

            <button className="accent-button" onClick={createQuickEvent} type="button">
              + Quick Event
            </button>
          </div>
        </header>

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
                      {isToday ? <small>Today</small> : null}
                    </div>
                    <div className="month-events">
                      {items.slice(0, 3).map((item) => renderEventChip(item))}
                      {items.length > 3 ? (
                        <p className="more-events">+{items.length - 3} more</p>
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
              <div className="time-col-label">Time</div>
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
          <h2>Quick Changes</h2>
          {!selectedEvent || !draft ? (
            <p className="empty-state">Select an event to edit details instantly.</p>
          ) : (
            <>
              <form className="quick-form" onSubmit={saveDraft}>
                <label>
                  Title
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
                  Type
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
                  Status
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
                    Date
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
                    Time
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
                    Duration (min)
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
                    Participants
                    <input
                      min={0}
                      step={1}
                      type="number"
                      value={draft.participants}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, participants: Number(event.target.value) || 0 }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>

                <button className="accent-button full-width" type="submit">
                  Save Changes
                </button>
              </form>

              <div className="quick-actions">
                <button onClick={() => applyQuickShift(24 * 60)} type="button">
                  Move +1 Day
                </button>
                <button onClick={() => applyQuickShift(-24 * 60)} type="button">
                  Move -1 Day
                </button>
                <button onClick={() => applyQuickDuration(15)} type="button">
                  Duration +15m
                </button>
                <button onClick={() => applyQuickDuration(-15)} type="button">
                  Duration -15m
                </button>
                <button onClick={duplicateSelected} type="button">
                  Duplicate
                </button>
                <button className="danger" onClick={deleteSelected} type="button">
                  Delete
                </button>
              </div>
            </>
          )}
        </section>

        <PointsIncomePanel />
        <ChatPanel />
      </aside>
    </main>
  );
}
