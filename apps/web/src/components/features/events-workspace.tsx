'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type ConflictCheckResult,
  type EventRecord,
  type EventType,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ApiError } from '@/app/lib/api/fetcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { ParticipantPicker } from './participant-picker';
import { useActiveWorkspace } from './use-active-workspace';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

type EventFormState = {
  title: string;
  type: EventType;
  description: string;
  dateInput: string;
  timeInput: string;
  durationMinutes: number;
  templateId: string;
  location: string;
  participantIds: string[];
};

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  EVENT: 'Событие',
  CUSTOM: 'Свободный формат',
};

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const todayDateInput = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentTimeInput = () => {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(Math.max(9, date.getHours()));
  return `${String(date.getHours()).padStart(2, '0')}:00`;
};

const initialEventForm = (): EventFormState => ({
  title: '',
  type: 'REHEARSAL',
  description: '',
  dateInput: todayDateInput(),
  timeInput: currentTimeInput(),
  durationMinutes: 120,
  templateId: '',
  location: '',
  participantIds: [],
});

const buildDateTime = (dateInput: string, timeInput: string) => {
  const [year, month, day] = dateInput.split('-').map(Number);
  const [hours, minutes] = timeInput.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60_000);
};

const rangeForApi = (form: EventFormState) => {
  const startsAt = buildDateTime(form.dateInput, form.timeInput);
  const endsAt = addMinutes(startsAt, form.durationMinutes);

  return {
    startsAt,
    endsAt,
  };
};

const templateParticipantsMap = (template: TemplateRecord | null) => {
  const map = new Map<
    string,
    {
      roleName: string;
      templateRoleId: string;
    }
  >();

  if (!template) {
    return map;
  }

  for (const role of template.roles) {
    for (const assignment of role.assignments) {
      if (!map.has(assignment.participantId)) {
        map.set(assignment.participantId, {
          templateRoleId: role.id,
          roleName: role.name,
        });
      }
    }
  }

  return map;
};

const rangeFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function EventsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | EventType>('ALL');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [form, setForm] = useState<EventFormState>(initialEventForm);
  const canManageEvents =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setEvents([]);
      setParticipants([]);
      setTemplates([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [eventsResponse, participantsResponse, templatesResponse] = await Promise.all([
        operationsApi.listEvents({
          organizationId: activeOrganizationId,
          accessToken,
          from: rangeFromNow(-14),
          to: rangeFromNow(60),
          limit: 200,
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 200,
        }),
        operationsApi.listTemplates({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 100,
        }),
      ]);

      setEvents(eventsResponse);
      setParticipants(participantsResponse);
      setTemplates(templatesResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить события');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) ?? null,
    [form.templateId, templates],
  );

  const selectedTemplateAssignments = useMemo(
    () => templateParticipantsMap(selectedTemplate),
    [selectedTemplate],
  );

  const visibleEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        event.title.toLowerCase().includes(normalizedSearch) ||
        event.location?.toLowerCase().includes(normalizedSearch) ||
        event.template?.name.toLowerCase().includes(normalizedSearch);

      const matchesType = typeFilter === 'ALL' || event.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [events, search, typeFilter]);

  const metrics = useMemo(() => {
    const rehearsals = events.filter((event) => event.type === 'REHEARSAL').length;
    const performances = events.filter((event) => event.type === 'PERFORMANCE').length;
    const upcoming = events.filter((event) => new Date(event.startsAt) > new Date()).length;

    return { rehearsals, performances, upcoming };
  }, [events]);

  useEffect(() => {
    if (!modalOpen) {
      setConflicts(null);
      return;
    }

    if (!accessToken || !activeOrganizationId || form.participantIds.length === 0) {
      setConflicts(null);
      return;
    }

    if (!form.dateInput || !form.timeInput || form.durationMinutes < 1) {
      setConflicts(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCheckingConflicts(true);

      try {
        const { startsAt, endsAt } = rangeForApi(form);
        const response = await operationsApi.checkConflicts({
          organizationId: activeOrganizationId,
          accessToken,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          participantIds: form.participantIds,
          signal: controller.signal,
        });

        setConflicts(response);
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorText(error instanceof Error ? error.message : 'Не удалось проверить конфликты');
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
      setCheckingConflicts(false);
    };
  }, [
    accessToken,
    activeOrganizationId,
    form.dateInput,
    form.durationMinutes,
    form.participantIds,
    form.timeInput,
    modalOpen,
  ]);

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      setForm((current) => ({
        ...current,
        templateId: '',
      }));
      return;
    }

    const templateParticipantIds = Array.from(templateParticipantsMap(template).keys());

    setForm((current) => ({
      ...current,
      templateId: template.id,
      title: template.name,
      type: template.type,
      durationMinutes: template.durationMinutes,
      participantIds: templateParticipantIds,
    }));
  };

  const createEvent = async (ignoreConflicts: boolean) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setCreating(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      if (form.title.trim().length < 2) {
        throw new Error('Название события должно содержать минимум 2 символа');
      }

      if (form.durationMinutes < 1) {
        throw new Error('Укажите корректную длительность');
      }

      const { startsAt, endsAt } = rangeForApi(form);

      await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          status: 'PLANNED',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: form.location.trim() || undefined,
          templateId: form.templateId || undefined,
          ignoreConflicts,
          participants: form.participantIds.map((participantId) => {
            const templateMeta = selectedTemplateAssignments.get(participantId);

            return {
              participantId,
              templateRoleId: templateMeta?.templateRoleId,
              roleName: templateMeta?.roleName,
            };
          }),
        },
      });

      setNoticeText(ignoreConflicts ? 'Событие создано несмотря на конфликты.' : 'Событие создано.');
      setForm(initialEventForm());
      setConflicts(null);
      setModalOpen(false);
      await loadData();
    } catch (error) {
      if (error instanceof ApiError && error.payload?.conflicts) {
        setConflicts(error.payload.conflicts as ConflictCheckResult);
      }

      setErrorText(error instanceof Error ? error.message : 'Не удалось создать событие');
    } finally {
      setCreating(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Events"
          title="Репетиции и события"
          description="Экран готов к работе, но сначала нужен активный membership в организации."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Events"
        title="Репетиции и события"
        description="Создавайте репетиции и спектакли из одного экрана. Если выбран шаблон, состав и длительность подставляются автоматически."
        actions={
          <div className="feature-page-header__action-row">
            <Input
              className="resource-search"
              placeholder="Поиск по названию или локации"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              className="resource-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'ALL' | EventType)}
            >
              <option value="ALL">Все типы</option>
              <option value="REHEARSAL">Репетиции</option>
              <option value="PERFORMANCE">Спектакли</option>
              <option value="EVENT">События</option>
              <option value="CUSTOM">Свободный формат</option>
            </Select>
            {canManageEvents ? (
              <Button type="button" onClick={() => setModalOpen(true)}>
              Создать событие
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="page-grid page-grid--three">
        <MetricCard
          label="Ближайшие события"
          value={String(metrics.upcoming)}
          meta="События в будущем окне планирования"
        />
        <MetricCard
          label="Репетиции"
          value={String(metrics.rehearsals)}
          meta="Количество рабочих репетиций в текущей выборке"
        />
        <MetricCard
          label="Спектакли"
          value={String(metrics.performances)}
          meta="Показы и performance-события"
        />
      </div>

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}
      {!canManageEvents ? (
        <p className="empty-state">
          Создавать и изменять события могут только ADMIN, DIRECTOR и ASSISTANT.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Лента событий</CardTitle>
          <CardDescription>
            Выбранный шаблон подставляет состав и длительность, а конфликты видны до сохранения.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="resource-skeleton-grid">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="resource-skeleton-card" />
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="resource-empty-inline">
              <strong>Событий пока нет</strong>
              <p>Создайте первое событие, чтобы запустить расписание и проверку занятости.</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Событие</th>
                    <th>Когда</th>
                    <th>Тип</th>
                    <th>Шаблон</th>
                    <th>Участники</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <div className="table-user-cell__copy">
                          <strong>{event.title}</strong>
                          <span>{event.location || 'Локация не указана'}</span>
                        </div>
                      </td>
                      <td>{dateTimeFormat.format(new Date(event.startsAt))}</td>
                      <td>
                        <Badge variant={event.type === 'PERFORMANCE' ? 'primary' : 'neutral'}>
                          {eventTypeLabels[event.type]}
                        </Badge>
                      </td>
                      <td>{event.template?.name || 'Без шаблона'}</td>
                      <td>{event.participants.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новое событие"
        description="Выберите шаблон, если хотите сразу подтянуть состав и длительность. Для репетиции можно заполнить форму вручную."
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            {conflicts?.hasConflicts ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => void createEvent(true)}
                loading={creating}
              >
                Создать несмотря на конфликты
              </Button>
            ) : null}
            <Button type="button" onClick={() => void createEvent(false)} loading={creating}>
              Сохранить событие
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          <div className="resource-form-grid resource-form-grid--double">
            <Select
              label="Шаблон спектакля"
              value={form.templateId}
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">Без шаблона</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>

            <Select
              label="Тип события"
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value as EventType }))
              }
            >
              <option value="REHEARSAL">Репетиция</option>
              <option value="PERFORMANCE">Спектакль</option>
              <option value="EVENT">Событие</option>
              <option value="CUSTOM">Свободный формат</option>
            </Select>
          </div>

          <Input
            label="Название"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />

          <div className="resource-form-grid resource-form-grid--triple">
            <Input
              label="Дата"
              type="date"
              value={form.dateInput}
              onChange={(event) =>
                setForm((current) => ({ ...current, dateInput: event.target.value }))
              }
            />
            <Input
              label="Время"
              type="time"
              value={form.timeInput}
              onChange={(event) =>
                setForm((current) => ({ ...current, timeInput: event.target.value }))
              }
            />
            <Input
              label="Длительность (мин)"
              type="number"
              min={1}
              step={15}
              value={String(form.durationMinutes)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  durationMinutes: Number(event.target.value) || 0,
                }))
              }
            />
          </div>

          <div className="resource-form-grid resource-form-grid--double">
            <Input
              label="Локация"
              value={form.location}
              onChange={(event) =>
                setForm((current) => ({ ...current, location: event.target.value }))
              }
            />
            <Input
              label="Краткое описание"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          <ParticipantPicker
            participants={participants}
            value={form.participantIds}
            onChange={(participantIds) => setForm((current) => ({ ...current, participantIds }))}
            label="Участники"
          />

          {checkingConflicts ? (
            <p className="finance-notice">Проверяем конфликты занятости...</p>
          ) : conflicts?.hasConflicts ? (
            <Card className="conflict-card">
              <CardHeader>
                <CardTitle>Найдены пересечения</CardTitle>
                <CardDescription>
                  Система обнаружила занятость части участников в выбранное время.
                </CardDescription>
              </CardHeader>
              <CardContent className="conflict-card__content">
                <ul className="conflict-list">
                  {conflicts.conflictsByParticipant.map((entry) => (
                    <li key={entry.participantId}>
                      <strong>{entry.participantName}</strong>
                      <span>
                        {entry.conflicts
                          .map((conflict) => conflict.title || conflict.reason || conflict.status)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : conflicts ? (
            <p className="finance-notice">Конфликтов не найдено.</p>
          ) : null}

          {selectedTemplate ? (
            <Card tone="subtle" className="resource-inline-panel">
              <CardContent className="resource-inline-panel__content">
                <div className="resource-inline-info">
                  <strong>Подтянуто из шаблона</strong>
                  <span>
                    {selectedTemplate.name} · {selectedTemplate.durationMinutes} мин ·{' '}
                    {selectedTemplate.roles.length > 0
                      ? Array.from(selectedTemplateAssignments.keys()).length
                      : 0}{' '}
                    участников
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
