'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type EventType,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
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
import { useToastFeedback } from './use-toast-feedback';
import { WorkspaceOrgEmpty } from './workspace-org-empty';
import { loadWorkspaceDefaults, pushRecentId, saveWorkspaceDefaults } from './workspace-defaults';

type TemplateFormState = {
  name: string;
  type: EventType;
  description: string;
  durationMinutes: number;
  participantIds: string[];
};

const durationPresets = [60, 90, 120, 180];

const createInitialTemplateForm = (): TemplateFormState => ({
  name: '',
  type: 'PERFORMANCE',
  description: '',
  durationMinutes: 120,
  participantIds: [],
});

const uniqueParticipantCount = (template: TemplateRecord): number => {
  const ids = new Set<string>();

  for (const role of template.roles) {
    for (const assignment of role.assignments) {
      ids.add(assignment.participantId);
    }
  }

  return ids.size;
};

export function TemplatesWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(createInitialTemplateForm);
  const [recentParticipantIds, setRecentParticipantIds] = useState<string[]>([]);
  const [handledQuickKey, setHandledQuickKey] = useState<string | null>(null);
  const canManageTemplates =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Спектакли',
    errorTitle: 'Спектакли',
  });

  const resetForm = useCallback(() => {
    const defaults = loadWorkspaceDefaults(activeOrganizationId);
    setRecentParticipantIds(defaults.recentParticipantIds ?? []);
    setForm((current) => ({
      ...createInitialTemplateForm(),
      durationMinutes: defaults.lastEventDurationMinutes ?? current.durationMinutes,
    }));
    setShowAdvanced(false);
  }, [activeOrganizationId]);

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setTemplates([]);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [templatesResponse, participantsResponse] = await Promise.all([
        operationsApi.listTemplates({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 100,
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 200,
        }),
      ]);

      const defaults = loadWorkspaceDefaults(activeOrganizationId);
      setRecentParticipantIds(defaults.recentParticipantIds ?? []);
      setTemplates(templatesResponse);
      setParticipants(participantsResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить шаблоны');
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
    const quickRequested = searchParams.get('quick') === '1';
    const quickKey = quickRequested ? `${activeOrganizationId ?? 'none'}:quick-template` : null;

    if (!quickRequested) {
      setHandledQuickKey(null);
      return;
    }

    if (!canManageTemplates || !quickKey || handledQuickKey === quickKey) {
      return;
    }

    resetForm();
    setModalOpen(true);
    setHandledQuickKey(quickKey);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('quick');
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl as Route);
  }, [activeOrganizationId, canManageTemplates, handledQuickKey, pathname, resetForm, router, searchParams]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = filterText.trim().toLowerCase();

    if (!normalizedQuery) {
      return templates;
    }

    return templates.filter((template) => {
      return (
        template.name.toLowerCase().includes(normalizedQuery) ||
        template.description?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [filterText, templates]);

  const metrics = useMemo(() => {
    const activeTemplates = templates.filter((template) => template.isActive).length;
    const totalParticipants = templates.reduce(
      (sum, template) => sum + uniqueParticipantCount(template),
      0,
    );
    const averageDuration =
      templates.length > 0
        ? Math.round(
            templates.reduce((sum, template) => sum + template.durationMinutes, 0) /
              templates.length,
          )
        : 0;

    return {
      activeTemplates,
      totalParticipants,
      averageDuration,
    };
  }, [templates]);

  const recentParticipants = useMemo(() => {
    const byId = new Map(participants.map((participant) => [participant.id, participant]));
    return recentParticipantIds
      .map((participantId) => byId.get(participantId) ?? null)
      .filter((participant): participant is ParticipantRecord => participant !== null);
  }, [participants, recentParticipantIds]);

  const toggleQuickParticipant = (participantId: string) => {
    setForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(participantId)
        ? current.participantIds.filter((item) => item !== participantId)
        : [...current.participantIds, participantId],
    }));
  };

  const handleCreateTemplate = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setCreating(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      if (form.name.trim().length < 2) {
        throw new Error('Название спектакля должно содержать минимум 2 символа');
      }

      if (form.durationMinutes < 1) {
        throw new Error('Укажите корректную длительность');
      }

      const created = await operationsApi.createTemplate({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          name: form.name.trim(),
          type: form.type,
          description: form.description.trim() || undefined,
          durationMinutes: form.durationMinutes,
          roles:
            form.participantIds.length > 0
              ? [
                  {
                    name: 'Основной состав',
                    participantIds: form.participantIds,
                    requiredCount: form.participantIds.length,
                    sortOrder: 1,
                  },
                ]
              : [],
        },
      });

      const defaults = saveWorkspaceDefaults(activeOrganizationId, {
        lastEventDurationMinutes: form.durationMinutes,
        recentParticipantIds: form.participantIds,
        recentTemplateIds: pushRecentId(loadWorkspaceDefaults(activeOrganizationId).recentTemplateIds, created.id),
      });

      setRecentParticipantIds(defaults.recentParticipantIds ?? []);
      setNoticeText('Спектакль создан. Теперь его можно сразу добавить в расписание.');
      resetForm();
      setModalOpen(false);
      await loadData();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать шаблон');
    } finally {
      setCreating(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Спектакли"
          title="Спектакли и шаблоны"
          description="Экран готов к работе, но сначала нужен активный membership в организации."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Спектакли"
        title="Шаблоны постановок"
        description="Сначала создайте спектакль, затем одной кнопкой перенесите его в расписание с уже готовым составом."
        actions={
          <div className="feature-page-header__action-row">
            <Input
              className="resource-search"
              placeholder="Найти спектакль"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
            />
            {canManageTemplates ? (
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
              >
                Добавить спектакль
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="page-grid page-grid--three">
        <MetricCard
          label="Активные шаблоны"
          value={String(metrics.activeTemplates)}
          meta="Готовы к постановке в расписание"
        />
        <MetricCard
          label="Участники в шаблонах"
          value={String(metrics.totalParticipants)}
          meta="Сколько людей уже заведено в постановки"
        />
        <MetricCard
          label="Средняя длительность"
          value={metrics.averageDuration > 0 ? `${metrics.averageDuration} мин` : '—'}
          meta="Помогает быстро создавать похожие события"
        />
      </div>

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}
      {!canManageTemplates ? (
        <p className="empty-state">
          Создавать и редактировать шаблоны могут только ADMIN, DIRECTOR и ASSISTANT.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Список спектаклей</CardTitle>
          <CardDescription>
            Основное действие на карточке — сразу поставить спектакль в расписание.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="resource-skeleton-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="resource-skeleton-card" />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="resource-empty-inline">
              <strong>Шаблонов пока нет</strong>
              <p>Создайте первый спектакль, чтобы потом переносить его в расписание в один клик.</p>
            </div>
          ) : (
            <div className="card-list-grid">
              {filteredTemplates.map((template) => (
                <Card key={template.id} tone="interactive" className="resource-card">
                  <CardHeader>
                    <div className="card-head-inline">
                      <CardTitle>{template.name}</CardTitle>
                      <Badge variant={template.isActive ? 'success' : 'neutral'}>
                        {template.isActive ? 'Активен' : 'Архив'}
                      </Badge>
                    </div>
                    <CardDescription>
                      {template.description?.trim() || 'Краткое описание пока не добавлено'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="resource-card__meta">
                    <div className="resource-pill-row">
                      <Badge variant="neutral">{template.type}</Badge>
                      <Badge variant="primary">{template.durationMinutes} мин</Badge>
                      <Badge variant="neutral">{uniqueParticipantCount(template)} участников</Badge>
                    </div>

                    <div className="resource-card__list">
                      {template.roles.length > 0 ? (
                        template.roles.slice(0, 2).map((role) => (
                          <div key={role.id} className="resource-inline-info">
                            <strong>{role.name}</strong>
                            <span>
                              {role.assignments.length > 0
                                ? role.assignments
                                    .slice(0, 3)
                                    .map((assignment) => participantDisplayName(assignment.participant))
                                    .join(', ')
                                : 'Состав пока не указан'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="resource-inline-info">
                          <strong>Состав</strong>
                          <span>В шаблоне пока нет закрепленных участников.</span>
                        </div>
                      )}
                    </div>

                    <div className="resource-card__actions">
                      <Link
                        className="ui-button ui-button--primary ui-button--md"
                        href={`/calendar?compose=1&kind=PERFORMANCE&templateId=${template.id}`}
                      >
                        <span className="ui-button__content">Добавить в расписание</span>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новый спектакль"
        description="Сохраняем только основное. Дополнительные поля раскрываются, только если они действительно нужны."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateTemplate()} loading={creating}>
              Сохранить спектакль
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          <Input
            label="Название спектакля"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />

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
            min={1}
            step={5}
            type="number"
            value={String(form.durationMinutes)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                durationMinutes: Number(event.target.value) || 0,
              }))
            }
          />

          {recentParticipants.length > 0 ? (
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

          <ParticipantPicker
            participants={participants}
            recentIds={recentParticipantIds}
            value={form.participantIds}
            onChange={(participantIds) => setForm((current) => ({ ...current, participantIds }))}
            label="Состав"
          />

          <button
            type="button"
            className="form-advanced-toggle"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? 'Скрыть дополнительные поля' : 'Дополнительно'}
          </button>

          {showAdvanced ? (
            <div className="resource-form-grid">
              <Select
                label="Тип"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, type: event.target.value as EventType }))
                }
              >
                <option value="PERFORMANCE">Спектакль</option>
                <option value="REHEARSAL">Репетиционная форма</option>
                <option value="EVENT">Событие</option>
                <option value="CUSTOM">Свободный формат</option>
              </Select>

              <label className="ui-field-group">
                <span className="ui-field-group__label">Описание</span>
                <textarea
                  className="ui-field"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Короткая заметка о постановке, если она действительно нужна"
                />
              </label>
            </div>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}

