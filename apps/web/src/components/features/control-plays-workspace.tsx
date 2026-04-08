'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type EventRecord,
  type ParticipantRecord,
  type TemplateRecord,
} from '@/app/lib/api/operations';
import { ParticipantPicker } from '@/components/features/participant-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { venueOptions, venueToneClass, type VenueName } from '@/lib/venues';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

type PlayRoleDraft = {
  id: string;
  name: string;
  mainParticipantIds: string[];
  alternateParticipantIds: string[];
};

type PlayFormState = {
  templateId: string | null;
  name: string;
  durationHours: string;
  durationMinutes: string;
  location: VenueName;
  isActive: boolean;
  hasAlternateCast: boolean;
  roles: PlayRoleDraft[];
};

type SavedPlayState = {
  id: string;
  name: string;
};

type PlayUsageStats = {
  totalEvents: number;
  upcomingEvents: number;
  lastStartsAt: string | null;
};

type PlaySortMode = 'recent' | 'name' | 'duration' | 'usage';
type PlayStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type PlayAlternateFilter = 'ALL' | 'WITH' | 'WITHOUT';

const durationPresets = [60, 90, 120, 150, 180];
const rolePresetTemplates = [
  { id: 'general', label: 'Общий состав', roles: ['Состав'] },
  { id: 'main-ensemble', label: 'Главные роли и ансамбль', roles: ['Главные роли', 'Ансамбль'] },
  { id: 'cast-tech', label: 'Актеры и техслужба', roles: ['Актеры', 'Техслужба'] },
];
const altSuffix = ' (дубль)';

const createDraftId = () => Math.random().toString(36).slice(2, 10);

const createRoleDraft = (name = 'Состав'): PlayRoleDraft => ({
  id: createDraftId(),
  name,
  mainParticipantIds: [],
  alternateParticipantIds: [],
});

const initialFormState = (): PlayFormState => ({
  templateId: null,
  name: '',
  durationHours: '2',
  durationMinutes: '0',
  location: 'БЗ',
  isActive: true,
  hasAlternateCast: false,
  roles: [createRoleDraft()],
});

const isAlternateRoleName = (name: string) => name.trim().toLowerCase().endsWith(altSuffix);
const baseRoleName = (name: string) => name.trim().replace(/\s+\(дубль\)$/i, '').trim() || 'Роль';

const toDurationParts = (totalMinutes: number) => ({
  durationHours: String(Math.floor(totalMinutes / 60)),
  durationMinutes: String(totalMinutes % 60),
});

const formatDurationLabel = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
};

const formatShortDate = (value: string | null) => {
  if (!value) return 'еще не ставился';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value));
};

const buildFormFromTemplate = (template: TemplateRecord): PlayFormState => {
  const grouped = new Map<string, PlayRoleDraft>();
  const legacyMain = template.roles.find((role) => role.name.trim() === 'Основной состав');
  const legacyAlternate = template.roles.find((role) => role.name.trim() === 'Дубль');

  if (legacyMain || legacyAlternate) {
    grouped.set('Состав', {
      id: createDraftId(),
      name: 'Состав',
      mainParticipantIds: legacyMain?.assignments.map((assignment) => assignment.participantId) ?? [],
      alternateParticipantIds: legacyAlternate?.assignments.map((assignment) => assignment.participantId) ?? [],
    });
  }

  template.roles.forEach((role) => {
    if (role.name.trim() === 'Основной состав' || role.name.trim() === 'Дубль') return;
    const name = baseRoleName(role.name);
    const current = grouped.get(name) ?? createRoleDraft(name);
    if (isAlternateRoleName(role.name)) {
      current.alternateParticipantIds = role.assignments.map((assignment) => assignment.participantId);
    } else {
      current.mainParticipantIds = role.assignments.map((assignment) => assignment.participantId);
    }
    grouped.set(name, current);
  });

  const roles = Array.from(grouped.values());
  const duration = toDurationParts(template.durationMinutes);

  return {
    templateId: template.id,
    name: template.name,
    durationHours: duration.durationHours,
    durationMinutes: duration.durationMinutes,
    location: template.location && venueOptions.includes(template.location as VenueName) ? (template.location as VenueName) : 'БЗ',
    isActive: template.isActive,
    hasAlternateCast: roles.some((role) => role.alternateParticipantIds.length > 0),
    roles: roles.length > 0 ? roles : [createRoleDraft()],
  };
};

const rolesToPayload = (roles: PlayRoleDraft[], hasAlternateCast: boolean) =>
  roles
    .flatMap((role, index) => {
      const normalizedName = role.name.trim() || `Роль ${index + 1}`;
      const entries = [
        {
          name: normalizedName,
          requiredCount: Math.max(role.mainParticipantIds.length, 1),
          sortOrder: index * 2 + 1,
          participantIds: role.mainParticipantIds,
        },
      ];

      if (hasAlternateCast && role.alternateParticipantIds.length > 0) {
        entries.push({
          name: `${normalizedName}${altSuffix}`,
          requiredCount: Math.max(role.alternateParticipantIds.length, 1),
          sortOrder: index * 2 + 2,
          participantIds: role.alternateParticipantIds,
        });
      }

      return entries;
    })
    .filter((role) => role.participantIds.length > 0 || role.name.trim().length > 0);

const normalizeMinutes = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 59);
};

const normalizeHours = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 12);
};

const getPlayUsageStats = (events: EventRecord[]) => {
  const stats = new Map<string, PlayUsageStats>();
  const now = Date.now();

  for (const event of events) {
    if (!event.templateId) continue;
    const current = stats.get(event.templateId) ?? { totalEvents: 0, upcomingEvents: 0, lastStartsAt: null };
    current.totalEvents += 1;
    if (new Date(event.startsAt).getTime() >= now) current.upcomingEvents += 1;
    if (!current.lastStartsAt || new Date(event.startsAt) > new Date(current.lastStartsAt)) {
      current.lastStartsAt = event.startsAt;
    }
    stats.set(event.templateId, current);
  }

  return stats;
};

const matchPlaySearch = (template: TemplateRecord, query: string, participantsById: Map<string, string>) => {
  if (!query) return true;
  const normalized = query.toLowerCase();
  const cast = template.roles
    .flatMap((role) => role.assignments.map((assignment) => participantsById.get(assignment.participantId) ?? ''))
    .join(' ')
    .toLowerCase();

  return (
    template.name.toLowerCase().includes(normalized) ||
    (template.location ?? '').toLowerCase().includes(normalized) ||
    cast.includes(normalized)
  );
};

export function ControlPlaysWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [form, setForm] = useState<PlayFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(null);
  const [castModalTemplate, setCastModalTemplate] = useState<TemplateRecord | null>(null);
  const [savedPlay, setSavedPlay] = useState<SavedPlayState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<PlaySortMode>('recent');
  const [venueFilter, setVenueFilter] = useState<'ALL' | VenueName>('ALL');
  const [statusFilter, setStatusFilter] = useState<PlayStatusFilter>('ALL');
  const [alternateFilter, setAlternateFilter] = useState<PlayAlternateFilter>('ALL');
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Спектакли',
    errorTitle: 'Спектакли',
  });

  const participantSummary = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participantDisplayName(participant)])),
    [participants],
  );

  const usageStats = useMemo(() => getPlayUsageStats(events), [events]);
  const totalDurationMinutes = useMemo(() => normalizeHours(form.durationHours) * 60 + normalizeMinutes(form.durationMinutes), [form.durationHours, form.durationMinutes]);
  const totalSelectedParticipants = useMemo(
    () => form.roles.reduce((count, role) => count + new Set([...role.mainParticipantIds, ...(form.hasAlternateCast ? role.alternateParticipantIds : [])]).size, 0),
    [form.hasAlternateCast, form.roles],
  );

  const formErrors = useMemo(() => {
    const hasNamedRoles = form.roles.some((role) => role.name.trim().length > 0);
    const hasMainCast = form.roles.some((role) => role.mainParticipantIds.length > 0);
    return {
      name: form.name.trim().length >= 2 ? '' : 'Укажите название спектакля.',
      duration: totalDurationMinutes > 0 ? '' : 'Укажите длительность спектакля.',
      cast: hasNamedRoles && hasMainCast ? '' : 'Добавьте хотя бы одну роль и выберите основной состав.',
    };
  }, [form.name, form.roles, totalDurationMinutes]);

  const isFormValid = useMemo(() => !formErrors.name && !formErrors.duration && !formErrors.cast, [formErrors]);

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
      const [templateResponse, participantResponse, eventResponse] = await Promise.all([
        operationsApi.listTemplates({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 200,
          type: 'PERFORMANCE',
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 400,
        }),
        operationsApi.listEvents({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 1000,
          type: 'PERFORMANCE',
          includeDrafts: true,
        }),
      ]);

      setPlays(templateResponse.filter((template) => template.type === 'PERFORMANCE'));
      setParticipants(participantResponse);
      setEvents(eventResponse.filter((event) => event.templateId !== null));
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить спектакли.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredPlays = useMemo(() => {
    const items = plays.filter((template) => {
      if (!matchPlaySearch(template, searchQuery.trim(), participantSummary)) return false;
      if (venueFilter !== 'ALL' && template.location !== venueFilter) return false;
      if (statusFilter === 'ACTIVE' && !template.isActive) return false;
      if (statusFilter === 'INACTIVE' && template.isActive) return false;

      const hasAlternate = template.roles.some((role) => isAlternateRoleName(role.name));
      if (alternateFilter === 'WITH' && !hasAlternate) return false;
      if (alternateFilter === 'WITHOUT' && hasAlternate) return false;
      return true;
    });

    return items.sort((left, right) => {
      if (sortMode === 'name') return left.name.localeCompare(right.name, 'ru');
      if (sortMode === 'duration') return right.durationMinutes - left.durationMinutes;
      if (sortMode === 'usage') {
        const leftUsage = usageStats.get(left.id)?.totalEvents ?? 0;
        const rightUsage = usageStats.get(right.id)?.totalEvents ?? 0;
        return rightUsage - leftUsage;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [alternateFilter, participantSummary, plays, searchQuery, sortMode, statusFilter, usageStats, venueFilter]);

  const resetForm = () => {
    setForm(initialFormState());
    setSavedPlay(null);
  };

  const handleDurationPreset = (minutes: number) => {
    const next = toDurationParts(minutes);
    setForm((current) => ({ ...current, durationHours: next.durationHours, durationMinutes: next.durationMinutes }));
  };

  const applyRolePreset = (roleNames: string[]) => {
    setForm((current) => ({
      ...current,
      roles: roleNames.map((roleName) => createRoleDraft(roleName)),
    }));
  };

  const updateRole = (roleId: string, updater: (role: PlayRoleDraft) => PlayRoleDraft) => {
    setForm((current) => ({
      ...current,
      roles: current.roles.map((role) => (role.id === roleId ? updater(role) : role)),
    }));
  };

  const addRole = () => {
    setForm((current) => ({
      ...current,
      roles: [...current.roles, createRoleDraft(`Роль ${current.roles.length + 1}`)],
    }));
  };

  const removeRole = (roleId: string) => {
    setForm((current) => {
      const nextRoles = current.roles.filter((role) => role.id !== roleId);
      return { ...current, roles: nextRoles.length > 0 ? nextRoles : [createRoleDraft()] };
    });
  };

  const handleSubmit = async () => {
    if (!accessToken || !activeOrganizationId || !isFormValid) return;

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);
    setSavedPlay(null);

    try {
      const payload = {
        name: form.name.trim(),
        type: 'PERFORMANCE' as const,
        durationMinutes: totalDurationMinutes,
        location: form.location,
        isActive: form.isActive,
        roles: rolesToPayload(form.roles, form.hasAlternateCast),
      };

      const result = form.templateId
        ? await operationsApi.updateTemplate({
            organizationId: activeOrganizationId,
            accessToken,
            templateId: form.templateId,
            payload,
          })
        : await operationsApi.createTemplate({
            organizationId: activeOrganizationId,
            accessToken,
            payload,
          });

      setPlays((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setSelectedPlayId(result.id);
      setSavedPlay({ id: result.id, name: result.name });
      setNoticeText(form.templateId ? `Спектакль «${result.name}» обновлен.` : `Спектакль «${result.name}» добавлен.`);
      setForm(buildFormFromTemplate(result));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить спектакль.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPlay = (template: TemplateRecord) => {
    setForm(buildFormFromTemplate(template));
    setSelectedPlayId(template.id);
    setSavedPlay(null);
    setNoticeText(`Открыли «${template.name}» для редактирования.`);
  };

  const handleDuplicatePlay = (template: TemplateRecord) => {
    const next = buildFormFromTemplate(template);
    next.templateId = null;
    next.name = `${template.name} (копия)`;
    setForm(next);
    setSelectedPlayId(template.id);
    setSavedPlay(null);
    setNoticeText(`Создали копию на основе «${template.name}».`);
  };

  const handleArchivePlay = async (template: TemplateRecord) => {
    if (!accessToken || !activeOrganizationId) return;
    if (!window.confirm(`Удалить спектакль «${template.name}»?`)) return;

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      await operationsApi.archiveTemplate({
        organizationId: activeOrganizationId,
        accessToken,
        templateId: template.id,
      });
      setPlays((current) => current.filter((item) => item.id !== template.id));
      if (form.templateId === template.id) setForm(initialFormState());
      setSelectedPlayId((current) => (current === template.id ? null : current));
      setNoticeText(`Спектакль «${template.name}» удален.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить спектакль.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManagementShell title="Спектакли" description="Добавление спектаклей, составов и быстрый переход в расписание.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="plays-layout">
        <Card>
          <CardHeader>
            <CardTitle>{form.templateId ? 'Редактировать спектакль' : 'Добавить спектакль'}</CardTitle>
            <CardDescription>Слева — создание и состав. Справа — управление уже существующими спектаклями.</CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
            {savedPlay ? (
              <div className="plays-success-panel">
                <div className="resource-inline-info">
                  <strong>{savedPlay.name}</strong>
                  <span>Сохранено. Можно сразу использовать спектакль в расписании или создать следующий.</span>
                </div>
                <div className="resource-card__actions">
                  <Link className="ui-button ui-button--ghost ui-button--sm" href={`/control/schedule?playId=${savedPlay.id}` as Route}>
                    <span className="ui-button__content">Использовать в расписании</span>
                  </Link>
                  <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                    Добавить ещё
                  </Button>
                </div>
              </div>
            ) : null}

            <Input
              label="Название"
              value={form.name}
              error={formErrors.name || undefined}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Например, Синбад"
            />

            <div className="plays-form-grid">
              <div className="plays-duration-grid">
                <Input
                  label="Часы"
                  type="number"
                  min={0}
                  max={12}
                  value={form.durationHours}
                  onChange={(event) => setForm((current) => ({ ...current, durationHours: event.target.value }))}
                />
                <Input
                  label="Минуты"
                  type="number"
                  min={0}
                  max={59}
                  value={form.durationMinutes}
                  error={formErrors.duration || undefined}
                  hint={`Итог: ${formatDurationLabel(totalDurationMinutes)}. Это время потом попадет в расписание.`}
                  onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                />
              </div>

              <Select
                label="Зал"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value as VenueName }))}
              >
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>{venue}</option>
                ))}
              </Select>
            </div>

            <div className="plays-preset-row">
              <span className="plays-preset-row__label">Быстрая длительность</span>
              <div className="plays-chip-row">
                {durationPresets.map((preset) => (
                  <button key={preset} type="button" className="plays-chip-button" onClick={() => handleDurationPreset(preset)}>
                    {formatDurationLabel(preset)}
                  </button>
                ))}
              </div>
            </div>

            <div className="plays-cast-section">
              <div className="plays-cast-section__header">
                <div>
                  <strong>Состав</strong>
                  <span>Роли, основной состав и дублеры.</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={addRole}>
                  Добавить роль
                </Button>
              </div>

              <div className="plays-preset-row">
                <span className="plays-preset-row__label">Быстрые шаблоны составов</span>
                <div className="plays-chip-row">
                  {rolePresetTemplates.map((preset) => (
                    <button key={preset.id} type="button" className="plays-chip-button" onClick={() => applyRolePreset(preset.roles)}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.hasAlternateCast}
                  onChange={(event) => setForm((current) => ({ ...current, hasAlternateCast: event.target.checked }))}
                />
                <span>Есть дубль</span>
              </label>

              <div className="plays-role-list">
                {form.roles.map((role, index) => {
                  const selectedMain = role.mainParticipantIds.map((participantId) => participantSummary.get(participantId)).filter((value): value is string => Boolean(value));
                  const selectedAlternate = role.alternateParticipantIds.map((participantId) => participantSummary.get(participantId)).filter((value): value is string => Boolean(value));

                  return (
                    <div key={role.id} className="plays-role-card">
                      <div className="plays-role-card__header">
                        <Input
                          label={`Роль ${index + 1}`}
                          value={role.name}
                          onChange={(event) => updateRole(role.id, (current) => ({ ...current, name: event.target.value }))}
                          placeholder="Например, Главные роли"
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRole(role.id)}>
                          Убрать
                        </Button>
                      </div>

                      <ParticipantPicker
                        label="Основной состав"
                        participants={participants}
                        value={role.mainParticipantIds}
                        onChange={(mainParticipantIds) => updateRole(role.id, (current) => ({ ...current, mainParticipantIds }))}
                        searchPlaceholder="Поиск по имени"
                      />

                      {selectedMain.length > 0 ? (
                        <div className="plays-selected-list">
                          {selectedMain.map((name) => (
                            <span key={`${role.id}-${name}`} className="plays-selected-chip">{name}</span>
                          ))}
                        </div>
                      ) : null}

                      {form.hasAlternateCast ? (
                        <>
                          <ParticipantPicker
                            label="Дублеры"
                            participants={participants}
                            value={role.alternateParticipantIds}
                            onChange={(alternateParticipantIds) => updateRole(role.id, (current) => ({ ...current, alternateParticipantIds }))}
                            searchPlaceholder="Кто дублирует роль"
                          />

                          {selectedAlternate.length > 0 ? (
                            <div className="plays-selected-list">
                              {selectedAlternate.map((name) => (
                                <span key={`${role.id}-alt-${name}`} className="plays-selected-chip plays-selected-chip--alt">{name}</span>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {formErrors.cast ? <p className="plays-helper plays-helper--error">{formErrors.cast}</p> : null}
            </div>

            <div className="plays-form-footer">
              <div className="plays-form-footer__meta">
                <span>Ролей: {form.roles.length}</span>
                <span>Выбрано участников: {totalSelectedParticipants}</span>
              </div>
              <div className="resource-card__actions">
                <Button type="button" variant="ghost" onClick={resetForm}>Очистить</Button>
                <Button type="button" onClick={() => void handleSubmit()} loading={saving} disabled={!isFormValid}>
                  {form.templateId ? 'Сохранить изменения' : 'Добавить спектакль'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Список спектаклей</CardTitle>
            <CardDescription>{filteredPlays.length} из {plays.length} спектаклей</CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
            <div className="plays-filter-grid">
              <Input label="Поиск" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="По названию" />
              <Select label="Сортировка" value={sortMode} onChange={(event) => setSortMode(event.target.value as PlaySortMode)}>
                <option value="recent">Сначала новые</option>
                <option value="name">По названию</option>
                <option value="duration">По длительности</option>
                <option value="usage">По использованию</option>
              </Select>
              <Select label="Зал" value={venueFilter} onChange={(event) => setVenueFilter(event.target.value as 'ALL' | VenueName)}>
                <option value="ALL">Все залы</option>
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>{venue}</option>
                ))}
              </Select>
              <Select label="Статус" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PlayStatusFilter)}>
                <option value="ALL">Все</option>
                <option value="ACTIVE">Активные</option>
                <option value="INACTIVE">Скрытые</option>
              </Select>
              <Select label="Дубль" value={alternateFilter} onChange={(event) => setAlternateFilter(event.target.value as PlayAlternateFilter)}>
                <option value="ALL">Все</option>
                <option value="WITH">Только с дублем</option>
                <option value="WITHOUT">Без дубля</option>
              </Select>
            </div>

            {loading ? (
              <p className="empty-state">Загружаем спектакли...</p>
            ) : filteredPlays.length === 0 ? (
              <div className="resource-empty-inline">
                <strong>Ничего не найдено</strong>
                <p>Измените фильтры или добавьте новый спектакль слева.</p>
              </div>
            ) : (
              <div className="plays-list-scroll">
                <div className="resource-card__list">
                  {filteredPlays.map((play) => {
                    const stats = usageStats.get(play.id) ?? { totalEvents: 0, upcomingEvents: 0, lastStartsAt: null };
                    const venue = play.location && venueOptions.includes(play.location as VenueName) ? (play.location as VenueName) : null;
                    const groupedRoles = play.roles.reduce<Record<string, { main: string[]; alt: string[] }>>((acc, role) => {
                      const name = baseRoleName(role.name);
                      const bucket = acc[name] ?? { main: [], alt: [] };
                      const names = role.assignments.map((assignment) => participantSummary.get(assignment.participantId) ?? 'Участник');
                      if (isAlternateRoleName(role.name)) {
                        bucket.alt = names;
                      } else {
                        bucket.main = names;
                      }
                      acc[name] = bucket;
                      return acc;
                    }, {});

                    return (
                      <div key={play.id} className={`play-card${selectedPlayId === play.id ? ' is-selected' : ''}`}>
                        <div className="play-card__header">
                          <div className="resource-inline-info">
                            <strong>{play.name}</strong>
                            <span>{formatDurationLabel(play.durationMinutes)}</span>
                          </div>
                          <div className="resource-card__actions">
                            {venue ? <Badge className={`venue-badge ${venueToneClass[venue]}`} title={venue}>{venue}</Badge> : null}
                            <Badge variant={play.isActive ? 'success' : 'neutral'}>{play.isActive ? 'Активен' : 'Скрыт'}</Badge>
                          </div>
                        </div>

                        <div className="play-card__stats">
                          <span>В расписании: {stats.totalEvents}</span>
                          <span>Ближайших: {stats.upcomingEvents}</span>
                          <span>Последний показ: {formatShortDate(stats.lastStartsAt)}</span>
                        </div>

                        <div className="play-card__roles">
                          {Object.entries(groupedRoles).map(([roleName, roleData]) => (
                            <div key={`${play.id}-${roleName}`} className="play-card__role-row">
                              <strong>{roleName}</strong>
                              <span>{roleData.main.length > 0 ? roleData.main.join(', ') : 'состав не указан'}</span>
                              {roleData.alt.length > 0 ? <span>Дубль: {roleData.alt.join(', ')}</span> : null}
                            </div>
                          ))}
                        </div>

                        <div className="play-card__actions">
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedPlayId(play.id); setCastModalTemplate(play); }}>
                            Открыть состав
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleEditPlay(play)}>
                            Редактировать
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleDuplicatePlay(play)}>
                            Дублировать
                          </Button>
                          <Link className="ui-button ui-button--ghost ui-button--sm" href={`/control/schedule?playId=${play.id}` as Route}>
                            <span className="ui-button__content">В расписание</span>
                          </Link>
                          <Button type="button" variant="danger" size="sm" onClick={() => void handleArchivePlay(play)} loading={saving}>
                            Удалить
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={Boolean(castModalTemplate)}
        onClose={() => setCastModalTemplate(null)}
        title={castModalTemplate?.name ?? 'Состав спектакля'}
        description="Основной и дублерский состав по ролям."
      >
        <div className="profile-stack">
          {castModalTemplate?.roles.length ? (
            Object.entries(
              castModalTemplate.roles.reduce<Record<string, { main: string[]; alt: string[] }>>((acc, role) => {
                const name = baseRoleName(role.name);
                const bucket = acc[name] ?? { main: [], alt: [] };
                const names = role.assignments.map((assignment) => participantSummary.get(assignment.participantId) ?? 'Участник');
                if (isAlternateRoleName(role.name)) {
                  bucket.alt = names;
                } else {
                  bucket.main = names;
                }
                acc[name] = bucket;
                return acc;
              }, {}),
            ).map(([roleName, roleData]) => (
              <div key={roleName} className="plays-cast-modal__row">
                <strong>{roleName}</strong>
                <span>Основной состав: {roleData.main.length > 0 ? roleData.main.join(', ') : 'не указан'}</span>
                {roleData.alt.length > 0 ? <span>Дубль: {roleData.alt.join(', ')}</span> : null}
              </div>
            ))
          ) : (
            <div className="resource-empty-inline">
              <strong>Состав не заполнен</strong>
              <p>У этого спектакля пока нет ролей и участников.</p>
            </div>
          )}
        </div>
      </Modal>
    </ManagementShell>
  );
}

