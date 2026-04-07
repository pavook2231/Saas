'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { operationsApi, participantDisplayName, type ParticipantRecord, type TemplateRecord } from '@/app/lib/api/operations';
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

type PlayFormState = {
  name: string;
  durationMinutes: string;
  location: VenueName;
  mainParticipantIds: string[];
  hasAlternateCast: boolean;
  alternateParticipantIds: string[];
};

const initialFormState: PlayFormState = {
  name: '',
  durationMinutes: '120',
  location: 'БЗ',
  mainParticipantIds: [],
  hasAlternateCast: false,
  alternateParticipantIds: [],
};

const templateParticipantIds = (template: TemplateRecord, roleName?: string) => {
  const roles = roleName ? template.roles.filter((role) => role.name === roleName) : template.roles;
  return Array.from(
    new Set(roles.flatMap((role) => role.assignments.map((assignment) => assignment.participantId))),
  );
};

export function ControlPlaysWorkspace() {
  const { accessToken, activeOrganizationId } = useActiveWorkspace();
  const [plays, setPlays] = useState<TemplateRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [form, setForm] = useState<PlayFormState>(initialFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Спектакли',
    errorTitle: 'Спектакли',
  });

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
          limit: 100,
          type: 'PERFORMANCE',
          isActive: true,
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

  const handleCreatePlay = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setSaving(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      const durationMinutes = Number(form.durationMinutes);

      if (form.name.trim().length < 2) {
        throw new Error('Укажите название спектакля.');
      }

      if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        throw new Error('Укажите длительность спектакля.');
      }

      const created = await operationsApi.createTemplate({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          name: form.name.trim(),
          type: 'PERFORMANCE',
          durationMinutes,
          location: form.location,
          roles: [
            {
              name: 'Основной состав',
              participantIds: form.mainParticipantIds,
              requiredCount: form.mainParticipantIds.length || 1,
              sortOrder: 1,
            },
            ...(form.hasAlternateCast
              ? [
                  {
                    name: 'Дубль',
                    participantIds: form.alternateParticipantIds,
                    requiredCount: form.alternateParticipantIds.length || 1,
                    sortOrder: 2,
                  },
                ]
              : []),
          ],
        },
      });

      setPlays((current) => [created, ...current]);
      setForm(initialFormState);
      setNoticeText(`Спектакль «${created.name}» добавлен.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить спектакль.');
    } finally {
      setSaving(false);
    }
  };

  const participantSummary = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participantDisplayName(participant)])),
    [participants],
  );

  return (
    <ManagementShell title="Спектакли" description="Добавление спектаклей без шаблонов и лишних настроек.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="page-grid page-grid--two">
        <Card>
          <CardHeader>
            <CardTitle>Добавить спектакль</CardTitle>
            <CardDescription>Название, длительность, зал и состав.</CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
            <Input
              label="Название"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <div className="resource-form-grid resource-form-grid--double">
              <Input
                label="Длительность, минут"
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
              />
              <Select
                label="Зал"
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value as VenueName }))
                }
              >
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>
                    {venue}
                  </option>
                ))}
              </Select>
            </div>

            <ParticipantPicker
              label="Состав"
              participants={participants}
              value={form.mainParticipantIds}
              onChange={(mainParticipantIds) => setForm((current) => ({ ...current, mainParticipantIds }))}
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.hasAlternateCast}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hasAlternateCast: event.target.checked,
                    alternateParticipantIds: event.target.checked ? current.alternateParticipantIds : [],
                  }))
                }
              />
              <span>Есть дубль</span>
            </label>

            {form.hasAlternateCast ? (
              <ParticipantPicker
                label="Дубль"
                participants={participants}
                value={form.alternateParticipantIds}
                onChange={(alternateParticipantIds) =>
                  setForm((current) => ({ ...current, alternateParticipantIds }))
                }
              />
            ) : null}

            <Button type="button" onClick={() => void handleCreatePlay()} loading={saving}>
              Добавить спектакль
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Список спектаклей</CardTitle>
            <CardDescription>Готовые спектакли для расписания и репертуара.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="empty-state">Загружаем спектакли...</p>
            ) : plays.length === 0 ? (
              <div className="resource-empty-inline">
                <strong>Спектаклей пока нет</strong>
                <p>Добавьте первый спектакль, чтобы использовать его в расписании.</p>
              </div>
            ) : (
              <div className="resource-card__list">
                {plays.map((play) => {
                  const mainCast = templateParticipantIds(play, 'Основной состав');
                  const alternateCast = templateParticipantIds(play, 'Дубль');
                  const venue = play.location && venueOptions.includes(play.location as VenueName)
                    ? (play.location as VenueName)
                    : null;

                  return (
                    <div key={play.id} className="play-card">
                      <div className="resource-inline-info">
                        <strong>{play.name}</strong>
                        <span>{play.durationMinutes} мин · {play.location ?? 'Зал не указан'}</span>
                        <span>
                          Состав: {mainCast.length > 0 ? mainCast.map((id) => participantSummary.get(id) ?? 'Участник').join(', ') : 'не указан'}
                        </span>
                        {alternateCast.length > 0 ? (
                          <span>
                            Дубль: {alternateCast.map((id) => participantSummary.get(id) ?? 'Участник').join(', ')}
                          </span>
                        ) : null}
                      </div>
                      <div className="resource-card__actions">
                        {venue ? <Badge className={`venue-badge ${venueToneClass[venue]}`}>{venue}</Badge> : null}
                        <Link className="ui-button ui-button--ghost ui-button--sm" href={`/control/schedule?playId=${play.id}`}>
                          <span className="ui-button__content">В расписание</span>
                        </Link>
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

