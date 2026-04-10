'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

import { loadWorkspaceDefaults, pushRecentId, saveWorkspaceDefaults } from './workspace-defaults';
import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { ParticipantPicker } from './participant-picker';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';
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

const alternateRoleSuffixPattern = /\s+\(дубль\)$/i;

const eventTypeLabels: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Гастроли',
  EVENT: 'Событие',
  CUSTOM: 'Свободный формат',
};

const defaultTitles: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Гастроли',
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const durationPresets = [60, 90, 120, 180];

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

const createInitialEventForm = (organizationId: string | null): EventFormState => {
  const defaults = loadWorkspaceDefaults(organizationId);

  return {
    title: '',
    type: defaults.lastEventType ?? 'REHEARSAL',
    description: '',
    dateInput: todayDateInput(),
    timeInput: currentTimeInput(),
    durationMinutes: defaults.lastEventDurationMinutes ?? 120,
    templateId: '',
    location: defaults.lastEventLocation ?? '',
    participantIds: [],
  };
};

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

const isAlternateRoleName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return normalized === 'дубль' || alternateRoleSuffixPattern.test(name.trim());
};

const templateHasAlternateCast = (template: TemplateRecord | null) =>
  Boolean(template?.roles.some((role) => isAlternateRoleName(role.name)));

const templateDefaultParticipantIds = (template: TemplateRecord | null) => {
  if (!template) {
    return [];
  }

  if (template.type === 'PERFORMANCE' && templateHasAlternateCast(template)) {
    return [];
  }

  return Array.from(templateParticipantsMap(template).keys());
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

const applyTemplateToForm = (form: EventFormState, template: TemplateRecord): EventFormState => ({
  ...form,
  templateId: template.id,
  title: template.name,
  type: template.type,
  durationMinutes: template.durationMinutes,
  participantIds: templateDefaultParticipantIds(template),
});

export function EventsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | EventType>('ALL');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [form, setForm] = useState<EventFormState>(() => createInitialEventForm(null));
  const [recentParticipantIds, setRecentParticipantIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [handledQuickKey, setHandledQuickKey] = useState<string | null>(null);
  const canManageEvents =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'События',
    errorTitle: 'События',
  });

  const resetForm = useCallback(
    (templateId?: string | null) => {
      const defaults = loadWorkspaceDefaults(activeOrganizationId);
      setRecentParticipantIds(defaults.recentParticipantIds ?? []);
      setRecentTemplateIds(defaults.recentTemplateIds ?? []);

      let nextForm = createInitialEventForm(activeOrganizationId);
      const template = templateId
        ? templates.find((item) => item.id === templateId) ?? null
        : null;

      if (template) {
        nextForm = applyTemplateToForm(nextForm, template);
      }

      setForm(nextForm);
      setShowAdvanced(!template);
      setConflicts(null);
    },
    [activeOrganizationId, templates],
  );

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

      const defaults = loadWorkspaceDefaults(activeOrganizationId);
      setRecentParticipantIds(defaults.recentParticipantIds ?? []);
      setRecentTemplateIds(defaults.recentTemplateIds ?? []);
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

  useEffect(() => {
    if (!activeOrganizationId) {
      return;
    }

    resetForm();
  }, [activeOrganizationId, resetForm]);

  useEffect(() => {
    if (!canManageEvents) {
      return;
    }

    const quickRequested = searchParams.get('quick') === '1';
    const templateId = searchParams.get('templateId');
    const quickKey = quickRequested ? `${activeOrganizationId ?? 'none'}:${templateId ?? 'blank'}` : null;

    if (!quickRequested) {
      setHandledQuickKey(null);
      return;
    }

    if (templateId && templates.length === 0) {
      return;
    }

    if (!quickKey || handledQuickKey === quickKey) {
      return;
    }

    resetForm(templateId);
    setModalOpen(true);
    setHandledQuickKey(quickKey);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('quick');
    params.delete('templateId');
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl as Route);
  }, [activeOrganizationId, canManageEvents, handledQuickKey, pathname, resetForm, router, searchParams, templates.length]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) ?? null,
    [form.templateId, templates],
  );

  const selectedTemplateAssignments = useMemo(
    () => templateParticipantsMap(selectedTemplate),
    [selectedTemplate],
  );
  const selectedTemplateHasAlternateCast = useMemo(
    () => templateHasAlternateCast(selectedTemplate),
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

  const recentTemplates = useMemo(() => {
    const byId = new Map(templates.map((template) => [template.id, template]));
    return recentTemplateIds
      .map((templateId) => byId.get(templateId) ?? null)
      .filter((template): template is TemplateRecord => template !== null);
  }, [recentTemplateIds, templates]);

  const recentParticipants = useMemo(() => {
    const byId = new Map(participants.map((participant) => [participant.id, participant]));
    return recentParticipantIds
      .map((participantId) => byId.get(participantId) ?? null)
      .filter((participant): participant is ParticipantRecord => participant !== null);
  }, [participants, recentParticipantIds]);

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

    setForm((current) => applyTemplateToForm(current, template));
  };

  const toggleQuickParticipant = (participantId: string) => {
    setForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(participantId)
        ? current.participantIds.filter((item) => item !== participantId)
        : [...current.participantIds, participantId],
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
      if (form.durationMinutes < 1) {
        throw new Error('Укажите корректную длительность');
      }

      const { startsAt, endsAt } = rangeForApi(form);
      const resolvedTitle = form.title.trim() || selectedTemplate?.name || defaultTitles[form.type];

      await operationsApi.createEvent({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          title: resolvedTitle,
          description: form.description.trim() || undefined,
          type: form.type,
          status: 'PLANNED',
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: form.location.trim() || undefined,
          templateId: form.templateId || undefined,
          ignoreConflicts,
          participants:
            selectedTemplate?.type === 'PERFORMANCE'
              ? undefined
              : form.participantIds.map((participantId) => {
                  const templateMeta = selectedTemplateAssignments.get(participantId);

                  return {
                    participantId,
                    templateRoleId: templateMeta?.templateRoleId,
                    roleName: templateMeta?.roleName,
                  };
                }),
        },
      });

      const previousDefaults = loadWorkspaceDefaults(activeOrganizationId);
      const nextDefaults = saveWorkspaceDefaults(activeOrganizationId, {
        lastEventType: form.type,
        lastEventDurationMinutes: form.durationMinutes,
        lastEventLocation: form.location,
        recentParticipantIds: form.participantIds,
        recentTemplateIds: form.templateId
          ? pushRecentId(previousDefaults.recentTemplateIds, form.templateId)
          : previousDefaults.recentTemplateIds,
      });

      setRecentParticipantIds(nextDefaults.recentParticipantIds ?? []);
      setRecentTemplateIds(nextDefaults.recentTemplateIds ?? []);
      setNoticeText(ignoreConflicts ? 'Событие создано несмотря на конфликты.' : 'Событие создано.');
      resetForm();
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
          eyebrow="События"
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
        eyebrow="События"
        title="Репетиции и показы"
        description="Основной сценарий теперь короткий: выбрать шаблон или тип, указать время и сохранить. Остальное скрыто до запроса."
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
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
              >
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
          meta="Что находится в ближайшем окне планирования"
        />
        <MetricCard
          label="Репетиции"
          value={String(metrics.rehearsals)}
          meta="Рабочие слоты в текущей выборке"
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
            Шаблон подставляет состав и длительность, а форма оставляет только важные действия на первом шаге.
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
              <p>Создайте первое событие и начните управлять расписанием без лишних переходов.</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Событие</th>
                    <th>Когда</th>
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
                          <span>{event.location || eventTypeLabels[event.type]}</span>
                        </div>
                      </td>
                      <td>{dateTimeFormat.format(new Date(event.startsAt))}</td>
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
        description="Сначала только главное: шаблон, время и длительность. Все дополнительные поля раскрываются по кнопке."
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
                Сохранить несмотря на конфликты
              </Button>
            ) : null}
            <Button type="button" onClick={() => void createEvent(false)} loading={creating}>
              Сохранить событие
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          {recentTemplates.length > 0 ? (
            <div className="modal-form-section">
              <span className="quick-choice-label">Недавние спектакли</span>
              <div className="quick-choice-row">
                {recentTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`quick-choice-chip${form.templateId === template.id ? ' is-active' : ''}`}
                    onClick={() => applyTemplate(template.id)}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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

          <div className="resource-form-grid resource-form-grid--double">
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
          </div>

          <div className="modal-form-section">
            <span className="quick-choice-label">Длительность</span>
            <div className="quick-choice-row">
              {durationPresets.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  className={`quick-choice-chip${form.durationMinutes === duration ? ' is-active' : ''}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      durationMinutes: duration,
                    }))
                  }
                >
                  {duration} мин
                </button>
              ))}
            </div>
          </div>

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

          {!selectedTemplate && recentParticipants.length > 0 ? (
            <div className="modal-form-section">
              <span className="quick-choice-label">Недавние участники</span>
              <div className="quick-choice-row">
                {recentParticipants.map((participant) => {
                  const active = form.participantIds.includes(participant.id);
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      className={`quick-choice-chip${active ? ' is-active' : ''}`}
                      onClick={() => toggleQuickParticipant(participant.id)}
                    >
                      {participantDisplayName(participant)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="form-advanced-toggle"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? 'Скрыть дополнительные поля' : 'Дополнительно'}
          </button>

          {showAdvanced ? (
            <div className="resource-form-grid">
              <Input
                label="Название"
                placeholder={selectedTemplate?.name || defaultTitles[form.type]}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />

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

              {selectedTemplate?.type === 'PERFORMANCE' ? (
                <Card tone="subtle" className="resource-inline-panel">
                  <CardContent className="resource-inline-panel__content">
                    <div className="resource-inline-info">
                      <strong>
                        {selectedTemplateHasAlternateCast
                          ? 'Состав выберется автоматически по дню'
                          : 'Состав подтянется из шаблона спектакля'}
                      </strong>
                      <span>
                        {selectedTemplateHasAlternateCast
                          ? 'Для спектакля с дублем система сама выберет 1 или 2 состав при создании события.'
                          : `${templateDefaultParticipantIds(selectedTemplate).length} участников будут добавлены автоматически.`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <ParticipantPicker
                  participants={participants}
                  recentIds={recentParticipantIds}
                  value={form.participantIds}
                  onChange={(participantIds) => setForm((current) => ({ ...current, participantIds }))}
                  label="Участники"
                />
              )}
            </div>
          ) : null}

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
                    {selectedTemplateHasAlternateCast && selectedTemplate.type === 'PERFORMANCE'
                      ? 'автосостав по дню'
                      : `${Array.from(selectedTemplateAssignments.keys()).length} участников`}
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

