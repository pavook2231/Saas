'use client';

import { useState } from 'react';

import { organizationsApi } from '@/app/lib/api/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

import { useActiveWorkspace } from './use-active-workspace';

type CreateOrganizationActionProps = {
  label?: string;
  variant?: 'primary' | 'ghost';
  onCreated?: () => void;
};

type FormState = {
  name: string;
  description: string;
  timezone: string;
};

const initialFormState: FormState = {
  name: '',
  description: '',
  timezone: 'Europe/Moscow',
};

export function CreateOrganizationAction({
  label = 'Создать организацию',
  variant = 'primary',
  onCreated,
}: CreateOrganizationActionProps) {
  const { accessToken, refreshOrganizations, setActiveOrganizationId } = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);

  const handleCreate = async () => {
    if (!accessToken) {
      return;
    }

    setSaving(true);
    setErrorText(null);

    try {
      if (form.name.trim().length < 2) {
        throw new Error('Название организации должно содержать минимум 2 символа.');
      }

      const created = await organizationsApi.createOrganization({
        accessToken,
        payload: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          timezone: form.timezone.trim() || undefined,
        },
      });

      await refreshOrganizations();
      setActiveOrganizationId(created.id);
      setForm(initialFormState);
      setOpen(false);
      onCreated?.();
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Не удалось создать организацию.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Новая организация"
        description="Создайте рабочее пространство для спектаклей, репетиций, участников и расписания."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreate()} loading={saving}>
              Создать организацию
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          <Input
            label="Название организации"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />

          <label className="ui-field-group">
            <span className="ui-field-group__label">Описание</span>
            <textarea
              className="ui-field"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Например: театр, студия, команда постановки или репетиционная группа"
            />
          </label>

          <Input
            label="Часовой пояс"
            value={form.timezone}
            onChange={(event) =>
              setForm((current) => ({ ...current, timezone: event.target.value }))
            }
          />

          {errorText ? <p className="finance-error">{errorText}</p> : null}
        </div>
      </Modal>
    </>
  );
}
