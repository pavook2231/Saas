'use client';

import { useState } from 'react';

import { organizationsApi } from '@/app/lib/api/organizations';
import { useToast } from '@/app/providers/toast-provider';
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
  const toast = useToast();
  const { accessToken, refreshOrganizations, setActiveOrganizationId } = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      setShowAdvanced(false);
      setOpen(false);
      toast.success('Организация создана. Можно сразу переходить к расписанию.');
      onCreated?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось создать организацию.';
      setErrorText(message);
      toast.error(message, 'Создание организации');
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
        description="Для старта нужен только понятный заголовок. Остальные поля можно раскрыть при необходимости."
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

          <button
            type="button"
            className="form-advanced-toggle"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? 'Скрыть дополнительные поля' : 'Описание и часовой пояс'}
          </button>

          {showAdvanced ? (
            <div className="resource-form-grid">
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
            </div>
          ) : null}

          {errorText ? <p className="finance-error">{errorText}</p> : null}
        </div>
      </Modal>
    </>
  );
}
