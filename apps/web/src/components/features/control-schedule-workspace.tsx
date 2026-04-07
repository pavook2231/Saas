'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { operationsApi, participantDisplayName, type EventRecord, type EventType, type ParticipantRecord, type TemplateRecord } from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { venueOptions, venueToneClass, type VenueName } from '@/lib/venues';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

type ScheduleKind = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT';

type ScheduleFormState = {
  kind: ScheduleKind;
  playId: string;
  title: string;
  date: string;
  startsAt: string;
  endsAt: string;
  location: VenueName;
  participantIds: string[];
};

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
  endsAt: plusHoursTime(2),
  location: 'БЗ',
  participantIds: [],
};

const toIso = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
};

const formatEventTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const mapPlayParticipants = (play: TemplateRecord) =>
  Array.from(new Set(play.roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId))));

export function ControlScheduleWorkspace() {
  const searchParams = useSearchParams();
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState<ScheduleFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          from: new Date().toISOString(),
          limit: 30,
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

  const handleKindChange = (kind: ScheduleKind) => {
    setForm((current) => ({
      ...current,
      kind,
      playId: kind === 'PERFORMANCE' ? current.playId : '',
      title: kind === 'PERFORMANCE' ? current.title : '',
      participantIds: kind === 'PERFORMANCE' ? current.participantIds : current.participantIds,
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

  const handleCreateEvent = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      const startsAtIso = toIso(form.date, form.startsAt);
      const endsAtIso = toIso(form.date, form.endsAt);

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

      const created = await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title,
          type: payloadType,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          location: form.location,
          templateId: form.kind === 'PERFORMANCE' ? form.playId || undefined : undefined,
          participants: form.participantIds.map((participantId) => ({
            participantId,
            isRequired: true,
          })),
        },
      });

      setEvents((current) => [created, ...current]);
      setForm((current) => ({
        ...initialFormState,
        date: current.date,
      }));
      setNoticeText(`Событие «${created.title}» добавлено в расписание.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось добавить событие.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManagementShell title="Составить расписание" description="Создание спектаклей, репетиций, сборов и других событий.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="page-grid page-grid--two">
        <Card>
          <CardHeader>
            <CardTitle>Новое событие</CardTitle>
            <CardDescription>Дата, время, площадка и занятые участники.</CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
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
                    {venue}
                  </option>
                ))}
              </Select>
            </div>

            <div className="resource-form-grid resource-form-grid--double">
              <Input
                label="Начало"
                type="time"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
              />
              <Input
                label="Окончание"
                type="time"
                value={form.endsAt}
                onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
              />
            </div>

            <ParticipantPicker
              participants={participants}
              value={form.participantIds}
              onChange={(participantIds) => setForm((current) => ({ ...current, participantIds }))}
            />

            <Button type="button" onClick={() => void handleCreateEvent()} loading={saving}>
              Добавить в расписание
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ближайшие события</CardTitle>
            <CardDescription>Чтобы сразу видеть, что уже стоит в расписании.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="empty-state">Загружаем события...</p>
            ) : events.length === 0 ? (
              <div className="resource-empty-inline">
                <strong>Событий пока нет</strong>
                <p>Первое событие появится здесь сразу после сохранения.</p>
              </div>
            ) : (
              <div className="resource-card__list">
                {events.slice(0, 12).map((event) => {
                  const venue = venueOptions.includes(event.location as VenueName)
                    ? (event.location as VenueName)
                    : null;

                  return (
                    <div key={event.id} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{event.title}</strong>
                        <span>{formatEventTime(event.startsAt)} — {formatEventTime(event.endsAt)}</span>
                        <span>
                          {event.participants.length > 0
                            ? event.participants.map((item) => participantDisplayName(item.participant)).join(', ')
                            : 'Без состава'}
                        </span>
                      </div>
                      <div className="resource-card__actions">
                        {venue ? <Badge className={`venue-badge ${venueToneClass[venue]}`}>{venue}</Badge> : null}
                        <Badge variant="neutral">
                          {event.type === 'PERFORMANCE' ? 'Спектакль' : event.type === 'REHEARSAL' ? 'Репетиция' : 'Событие'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ManagementShell>
  );
}

