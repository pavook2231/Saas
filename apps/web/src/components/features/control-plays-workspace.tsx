'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
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
import { isVenueName, venueLabelMap, venueOptions, venueToneClass, type VenueName } from '@/lib/venues';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useMobileViewport } from './use-mobile-viewport';
import { useToastFeedback } from './use-toast-feedback';

type PlayRoleDraft = {
  id: string;
  name: string;
  primaryParticipantIds: string[];
  alternateParticipantIds: string[];
};

type PlayFormState = {
  templateId: string | null;
  name: string;
  durationText: string;
  location: VenueName;
  isActive: boolean;
  hasAlternateCast: boolean;
  roles: PlayRoleDraft[];
};

type PlayStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type GroupedRoleSummary = {
  name: string;
  primary: string[];
  alternate: string[];
};

const alternateRoleSuffixPattern = /\s+\(дубль\)$/i;
const legacyMainCastRoleName = 'основной состав';
const legacyAlternateCastRoleName = 'дубль';

const createDraftId = () => Math.random().toString(36).slice(2, 10);

const createRoleDraft = (name = ''): PlayRoleDraft => ({
  id: createDraftId(),
  name,
  primaryParticipantIds: [],
  alternateParticipantIds: [],
});

const initialFormState = (): PlayFormState => ({
  templateId: null,
  name: '',
  durationText: '02:00',
  location: 'БЗ',
  isActive: true,
  hasAlternateCast: false,
  roles: [createRoleDraft('Главные роли')],
});

const isAlternateRoleName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return normalized === legacyAlternateCastRoleName || alternateRoleSuffixPattern.test(name.trim());
};

const getBaseRoleName = (name: string) => {
  const normalized = name.trim();
  const lowered = normalized.toLowerCase();

  if (lowered === legacyMainCastRoleName || lowered === legacyAlternateCastRoleName) {
    return 'Состав';
  }

  return normalized.replace(alternateRoleSuffixPattern, '').trim() || 'Роль';
};

const formatDurationLabel = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${minutes} мин`;
};

const formatDurationInput = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseDurationMinutes = (value: string) => {
  const normalized = value.trim();

  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    const minutes = Number(normalized);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;

  const totalMinutes = hours * 60 + minutes;
  return totalMinutes > 0 ? totalMinutes : null;
};

const groupTemplateRoles = (
  template: TemplateRecord,
  participantNames: Map<string, string>,
): GroupedRoleSummary[] => {
  const grouped = new Map<string, GroupedRoleSummary>();
  const legacyMain = template.roles.find((role) => role.name.trim().toLowerCase() === legacyMainCastRoleName);
  const legacyAlternate = template.roles.find((role) => role.name.trim().toLowerCase() === legacyAlternateCastRoleName);

  if (legacyMain || legacyAlternate) {
    grouped.set('Состав', {
      name: 'Состав',
      primary: legacyMain?.assignments.map((assignment) => participantNames.get(assignment.participantId) ?? 'Участник') ?? [],
      alternate: legacyAlternate?.assignments.map((assignment) => participantNames.get(assignment.participantId) ?? 'Участник') ?? [],
    });
  }

  template.roles.forEach((role) => {
    if (
      role.name.trim().toLowerCase() === legacyMainCastRoleName ||
      role.name.trim().toLowerCase() === legacyAlternateCastRoleName
    ) {
      return;
    }

    const roleName = getBaseRoleName(role.name);
    const current = grouped.get(roleName) ?? { name: roleName, primary: [], alternate: [] };
    const selectedNames = role.assignments.map((assignment) => participantNames.get(assignment.participantId) ?? 'Участник');

    if (isAlternateRoleName(role.name)) {
      current.alternate = selectedNames;
    } else {
      current.primary = selectedNames;
    }

    grouped.set(roleName, current);
  });

  return Array.from(grouped.values());
};

const buildFormFromTemplate = (template: TemplateRecord): PlayFormState => {
  const grouped = new Map<string, PlayRoleDraft>();
  const legacyMain = template.roles.find((role) => role.name.trim().toLowerCase() === legacyMainCastRoleName);
  const legacyAlternate = template.roles.find((role) => role.name.trim().toLowerCase() === legacyAlternateCastRoleName);

  if (legacyMain || legacyAlternate) {
    grouped.set('Состав', {
      id: createDraftId(),
      name: 'Состав',
      primaryParticipantIds: legacyMain?.assignments.map((assignment) => assignment.participantId) ?? [],
      alternateParticipantIds: legacyAlternate?.assignments.map((assignment) => assignment.participantId) ?? [],
    });
  }

  template.roles.forEach((role) => {
    if (
      role.name.trim().toLowerCase() === legacyMainCastRoleName ||
      role.name.trim().toLowerCase() === legacyAlternateCastRoleName
    ) {
      return;
    }

    const roleName = getBaseRoleName(role.name);
    const current = grouped.get(roleName) ?? createRoleDraft(roleName);

    if (isAlternateRoleName(role.name)) {
      current.alternateParticipantIds = role.assignments.map((assignment) => assignment.participantId);
    } else {
      current.primaryParticipantIds = role.assignments.map((assignment) => assignment.participantId);
    }

    grouped.set(roleName, current);
  });

  const roles = Array.from(grouped.values());

  return {
    templateId: template.id,
    name: template.name,
    durationText: formatDurationInput(template.durationMinutes),
    location: isVenueName(template.location) ? template.location : 'БЗ',
    isActive: template.isActive,
    hasAlternateCast: roles.some((role) => role.alternateParticipantIds.length > 0),
    roles: roles.length > 0 ? roles : [createRoleDraft('Главные роли')],
  };
};

const rolesToPayload = (roles: PlayRoleDraft[], hasAlternateCast: boolean) =>
  roles.flatMap((role, index) => {
    const name = role.name.trim() || `Роль ${index + 1}`;
    const payload = [
      {
        name,
        requiredCount: Math.max(role.primaryParticipantIds.length, 1),
        sortOrder: index * 2 + 1,
        participantIds: role.primaryParticipantIds,
      },
    ];

    if (hasAlternateCast) {
      payload.push({
        name: `${name} (дубль)`,
        requiredCount: Math.max(role.alternateParticipantIds.length, 1),
        sortOrder: index * 2 + 2,
        participantIds: role.alternateParticipantIds,
      });
    }

    return payload;
  });

const templateHasAlternateCast = (template: TemplateRecord) =>
  template.roles.some((role) => isAlternateRoleName(role.name));

export function ControlPlaysWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const isMobileViewport = useMobileViewport();
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [form, setForm] = useState<PlayFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlayStatusFilter>('ALL');
  const [mobileActionPlayId, setMobileActionPlayId] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Спектакли',
    errorTitle: 'Спектакли',
  });

  const participantNames = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participantDisplayName(participant)])),
    [participants],
  );

  const durationMinutes = useMemo(() => parseDurationMinutes(form.durationText), [form.durationText]);

  const formErrors = useMemo(() => {
    const hasInvalidRole = form.roles.some((role) => {
      if (role.name.trim().length === 0) {
        return true;
      }

      if (role.primaryParticipantIds.length === 0) {
        return true;
      }

      if (form.hasAlternateCast && role.alternateParticipantIds.length === 0) {
        return true;
      }

      return false;
    });

    return {
      name: form.name.trim().length >= 2 ? '' : 'Укажите название спектакля.',
      duration: durationMinutes && durationMinutes > 0 ? '' : 'Введите длительность в минутах или формате ЧЧ:ММ.',
      cast: !hasInvalidRole
        ? ''
        : form.hasAlternateCast
          ? 'Для каждой роли заполните название, 1 состав и 2 состав.'
          : 'Для каждой роли заполните название и основной состав.',
    };
  }, [durationMinutes, form.hasAlternateCast, form.name, form.roles]);

  const filteredPlays = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return plays.filter((play) => {
      if (statusFilter === 'ACTIVE' && !play.isActive) return false;
      if (statusFilter === 'INACTIVE' && play.isActive) return false;
      if (!query) return true;

      const groupedRoles = groupTemplateRoles(play, participantNames)
        .flatMap((role) => [role.name, role.primary.join(' '), role.alternate.join(' ')])
        .join(' ')
        .toLowerCase();

      return (
        play.name.toLowerCase().includes(query) ||
        (play.location ?? '').toLowerCase().includes(query) ||
        groupedRoles.includes(query)
      );
    });
  }, [participantNames, plays, searchQuery, statusFilter]);

  const mobileActionPlay = useMemo(
    () => plays.find((play) => play.id === mobileActionPlayId) ?? null,
    [mobileActionPlayId, plays],
  );

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setPlays([]);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [templateResponse, participantResponse] = await Promise.all([
        operationsApi.listTemplates({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 200,
          type: 'PERFORMANCE',
        }),
        operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 300,
        }),
      ]);

      setPlays(templateResponse.filter((template) => template.type === 'PERFORMANCE'));
      setParticipants(participantResponse);
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

  const resetForm = useCallback(() => {
    setForm(initialFormState());
  }, []);

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (template: TemplateRecord) => {
    setForm(buildFormFromTemplate(template));
    setModalOpen(true);
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
      return {
        ...current,
        roles: nextRoles.length > 0 ? nextRoles : [createRoleDraft('Главные роли')],
      };
    });
  };

  const handleSubmit = async () => {
    if (!accessToken || !activeOrganizationId || saving) return;
    if (formErrors.name || formErrors.duration || formErrors.cast || !durationMinutes) return;

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      const payload = {
        name: form.name.trim(),
        type: 'PERFORMANCE' as const,
        durationMinutes,
        location: form.location,
        isActive: form.isActive,
        roles: rolesToPayload(form.roles, form.hasAlternateCast),
      };

      const saved = form.templateId
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

      setPlays((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setModalOpen(false);
      resetForm();
      setNoticeText(form.templateId ? `Спектакль «${saved.name}» обновлен.` : `Спектакль «${saved.name}» создан.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить спектакль.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchivePlay = async (template: TemplateRecord) => {
    if (!accessToken || !activeOrganizationId || saving) return;
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
      setNoticeText(`Спектакль «${template.name}» удален.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить спектакль.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManagementShell title="Спектакли" description="Простая библиотека спектаклей, ролей и составов без лишней перегрузки.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <Card>
        <CardHeader className="plays-page__header">
          <div>
            <CardTitle>Библиотека спектаклей</CardTitle>
            <CardDescription>
              Название, длительность, зал и составы. Если у спектакля есть дубль, в расписании можно будет чередовать 1 и 2 состав по дням.
            </CardDescription>
          </div>
          <Button type="button" onClick={openCreateModal}>
            Новый спектакль
          </Button>
        </CardHeader>
        <CardContent className="profile-stack">
          <div className="plays-toolbar">
            <Input
              label="Поиск"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="По названию, залу или участнику"
            />
            <Select
              label="Статус"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as PlayStatusFilter)}
            >
              <option value="ALL">Все спектакли</option>
              <option value="ACTIVE">Только активные</option>
              <option value="INACTIVE">Только скрытые</option>
            </Select>
          </div>

          {loading ? (
            <div className="plays-list plays-list--skeleton">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="plays-card plays-card--skeleton" />
              ))}
            </div>
          ) : filteredPlays.length === 0 ? (
            <div className="resource-empty-inline plays-empty-state">
              <strong>{plays.length === 0 ? 'Пока нет ни одного спектакля' : 'Ничего не найдено'}</strong>
              <p>
                {plays.length === 0
                  ? 'Добавьте первый спектакль и сразу задайте зал, длительность и состав.'
                  : 'Смените фильтры или поисковый запрос.'}
              </p>
            </div>
          ) : isMobileViewport ? (
            <div className="plays-mobile-list">
              {filteredPlays.map((play) => {
                const groupedRoles = groupTemplateRoles(play, participantNames);
                const venue = isVenueName(play.location) ? play.location : null;
                const actorsCount = new Set(groupedRoles.flatMap((role) => [...role.primary, ...role.alternate])).size;

                return (
                  <article key={play.id} className="plays-mobile-card">
                    <div className="plays-mobile-card__head">
                      <div>
                        <h3>{play.name}</h3>
                        <p>
                          {formatDurationLabel(play.durationMinutes)}
                          {venue ? ` · ${venueLabelMap[venue]}` : ''}
                        </p>
                      </div>
                      <Badge variant={play.isActive ? 'success' : 'neutral'}>
                        {play.isActive ? 'Активен' : 'Скрыт'}
                      </Badge>
                    </div>

                    <div className="plays-mobile-card__meta">
                      <span>{groupedRoles.length} ролей</span>
                      <span>{actorsCount} участников</span>
                      {templateHasAlternateCast(play) ? <span>1/2 состав</span> : null}
                    </div>

                    <div className="plays-mobile-card__roles">
                      {groupedRoles.slice(0, 2).map((role) => (
                        <div key={`${play.id}-${role.name}`} className="plays-mobile-card__role">
                          <strong>{role.name}</strong>
                          <span>{role.primary.length > 0 ? role.primary.join(', ') : 'Основной состав не заполнен'}</span>
                        </div>
                      ))}
                    </div>

                    <div className="plays-mobile-card__actions">
                      <Link
                        className="ui-button ui-button--primary ui-button--sm"
                        href={`/control/schedule?playId=${play.id}` as Route}
                      >
                        <span className="ui-button__content">В расписание</span>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMobileActionPlayId(play.id)}
                      >
                        Ещё
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="plays-list">
              {filteredPlays.map((play) => {
                const groupedRoles = groupTemplateRoles(play, participantNames);
                const venue = isVenueName(play.location) ? play.location : null;
                const actorsCount = new Set(groupedRoles.flatMap((role) => [...role.primary, ...role.alternate])).size;

                return (
                  <article key={play.id} className="plays-card">
                    <div className="plays-card__top">
                      <div className="plays-card__identity">
                        <h3>{play.name}</h3>
                        <p>{formatDurationLabel(play.durationMinutes)}</p>
                        <div className="plays-card__summary">
                          <span>{groupedRoles.length} ролей</span>
                          <span>{actorsCount} участников</span>
                        </div>
                      </div>
                      <div className="plays-card__roles">
                        {groupedRoles.slice(0, 2).map((role) => (
                          <div key={`${play.id}-${role.name}`} className="plays-card__role-row">
                            <strong>{role.name}</strong>
                            <span>{role.primary.length > 0 ? role.primary.join(', ') : '1 состав не заполнен'}</span>
                            {templateHasAlternateCast(play) ? (
                              <em>{role.alternate.length > 0 ? `2 состав: ${role.alternate.join(', ')}` : '2 состав пока не заполнен'}</em>
                            ) : null}
                          </div>
                        ))}
                        {groupedRoles.length > 2 ? <span className="plays-card__more">Еще ролей: {groupedRoles.length - 2}</span> : null}
                      </div>

                      <div className="plays-card__aside">
                        <div className="plays-card__badges">
                          {venue ? (
                            <Badge className={`venue-badge ${venueToneClass[venue]}`} title={venueLabelMap[venue]}>
                              {venue}
                            </Badge>
                          ) : null}
                          {templateHasAlternateCast(play) ? <Badge variant="primary">1/2 состав</Badge> : null}
                          <Badge variant={play.isActive ? 'success' : 'neutral'}>
                            {play.isActive ? 'Активен' : 'Скрыт'}
                          </Badge>
                        </div>

                        <div className="plays-card__actions">
                          <Button type="button" variant="ghost" size="sm" onClick={() => openEditModal(play)}>
                            Редактировать
                          </Button>
                          <Link className="ui-button ui-button--ghost ui-button--sm" href={`/control/schedule?playId=${play.id}` as Route}>
                            <span className="ui-button__content">В расписание</span>
                          </Link>
                          <Button type="button" variant="danger" size="sm" onClick={() => void handleArchivePlay(play)} loading={saving}>
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={Boolean(mobileActionPlay)}
        onClose={() => setMobileActionPlayId(null)}
        title={mobileActionPlay?.name}
        description="Выберите действие для карточки спектакля."
        panelClassName="mobile-action-sheet"
      >
        {mobileActionPlay ? (
          <div className="mobile-action-sheet__actions">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                setMobileActionPlayId(null);
                openEditModal(mobileActionPlay);
              }}
            >
              Редактировать
            </Button>
            <Link
              className="ui-button ui-button--ghost ui-button--md ui-button--full"
              href={`/control/schedule?playId=${mobileActionPlay.id}` as Route}
              onClick={() => setMobileActionPlayId(null)}
            >
              <span className="ui-button__content">Открыть в расписании</span>
            </Link>
            <Button
              type="button"
              variant="danger"
              fullWidth
              onClick={() => {
                setMobileActionPlayId(null);
                void handleArchivePlay(mobileActionPlay);
              }}
              loading={saving}
            >
              Удалить
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={form.templateId ? 'Редактировать спектакль' : 'Новый спектакль'}
        description="Чистая карточка спектакля: длительность, зал и составы по ролям."
        size="lg"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} loading={saving}>
              {form.templateId ? 'Сохранить изменения' : 'Создать спектакль'}
            </Button>
          </>
        )}
      >
        <div className="plays-editor">
          <div className="plays-editor__grid">
            <Input
              label="Название спектакля"
              value={form.name}
              error={formErrors.name || undefined}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Например, Синбад"
            />
            <Input
              label="Продолжительность"
              value={form.durationText}
              error={formErrors.duration || undefined}
              hint={durationMinutes ? `Сохраним как ${formatDurationLabel(durationMinutes)}.` : 'Можно ввести 135 или 02:15.'}
              onChange={(event) => setForm((current) => ({ ...current, durationText: event.target.value }))}
              placeholder="02:15 или 135"
            />
            <Select
              label="Зал"
              value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value as VenueName }))}
            >
              {venueOptions.map((venue) => (
                <option key={venue} value={venue}>
                  {venueLabelMap[venue]}
                </option>
              ))}
            </Select>
            <Select
              label="Видимость"
              value={form.isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'ACTIVE' }))}
            >
              <option value="ACTIVE">Активный</option>
              <option value="INACTIVE">Скрытый</option>
            </Select>
          </div>

          <label className="checkbox-row plays-editor__toggle">
            <input
              type="checkbox"
              checked={form.hasAlternateCast}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  hasAlternateCast: event.target.checked,
                }))
              }
            />
            <span>Есть 2 состав</span>
          </label>

          <div className="plays-editor__hint-card">
            <strong>Как работают 1 и 2 состав</strong>
            <p>
              Если у спектакля есть дубль, вы просто указываете, кто заменяет кого по каждой роли. Дальше расписание само чередует 1 и 2 состав по дням, а при необходимости администратор может вручную переключить конкретный день.
            </p>
          </div>

          <div className="plays-editor__section-head">
            <div>
              <strong>Состав участников</strong>
              <p>Для каждой роли сначала выберите 1 состав, а если есть замена — укажите, кто играет ту же роль во 2 составе.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addRole}>
              Добавить роль
            </Button>
          </div>

          <div className="plays-role-grid">
            {form.roles.map((role, index) => (
              <div key={role.id} className="plays-role-editor">
                <div className="plays-role-editor__top">
                  <Input
                    label={`Роль ${index + 1}`}
                    value={role.name}
                    onChange={(event) => updateRole(role.id, (current) => ({ ...current, name: event.target.value }))}
                    placeholder="Например, Султан"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRole(role.id)}>
                    Убрать
                  </Button>
                </div>

                <ParticipantPicker
                  label={form.hasAlternateCast ? '1 состав · основа' : 'Участники роли'}
                  participants={participants}
                  value={role.primaryParticipantIds}
                  onChange={(primaryParticipantIds) => updateRole(role.id, (current) => ({ ...current, primaryParticipantIds }))}
                  searchPlaceholder="Найти актера по имени"
                />

                <div className={`plays-role-editor__alternate${form.hasAlternateCast ? ' is-visible' : ''}`}>
                  {form.hasAlternateCast ? (
                    <>
                      <p className="plays-role-editor__replacement-hint">
                        Кто заменяет {role.primaryParticipantIds.length > 0 ? 'этот 1 состав' : 'эту роль'} во 2 составе
                      </p>
                      <ParticipantPicker
                        label="2 состав · замена"
                        participants={participants}
                        value={role.alternateParticipantIds}
                        onChange={(alternateParticipantIds) => updateRole(role.id, (current) => ({ ...current, alternateParticipantIds }))}
                        searchPlaceholder="Кто заменяет эту роль"
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {formErrors.cast ? <p className="plays-helper plays-helper--error">{formErrors.cast}</p> : null}
        </div>
      </Modal>
    </ManagementShell>
  );
}

