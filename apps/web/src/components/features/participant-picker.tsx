'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  participantDisplayName,
  type ParticipantRecord,
} from '@/app/lib/api/operations';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

type ParticipantPickerProps = {
  emptyText?: string;
  label?: string;
  participants: ParticipantRecord[];
  recentIds?: string[];
  searchPlaceholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
};

type ParticipantOption = {
  value: string;
  label: string;
  description: string;
  badge: string | null;
  avatarLabel: string;
  searchableText: string;
};

const sortParticipants = (participants: ParticipantRecord[], recentIds: string[]) => {
  const recentOrder = new Map(recentIds.map((id, index) => [id, index]));

  return [...participants].sort((left, right) => {
    const leftRecent = recentOrder.get(left.id);
    const rightRecent = recentOrder.get(right.id);

    if (leftRecent !== undefined && rightRecent !== undefined) {
      return leftRecent - rightRecent;
    }

    if (leftRecent !== undefined) {
      return -1;
    }

    if (rightRecent !== undefined) {
      return 1;
    }

    return participantDisplayName(left).localeCompare(participantDisplayName(right), 'ru');
  });
};

const pluralizeParticipants = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'участник';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'участника';
  }

  return 'участников';
};

export function ParticipantPicker({
  emptyText = 'Участники не найдены',
  label = 'Участники',
  participants,
  recentIds = [],
  searchPlaceholder = 'Найти участника',
  value,
  onChange,
}: ParticipantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo<ParticipantOption[]>(
    () =>
      sortParticipants(participants, recentIds).map((participant) => {
        const labelText = participantDisplayName(participant);
        return {
          value: participant.id,
          label: labelText,
          description: participant.userId ? 'С аккаунтом' : 'Без аккаунта',
          badge: recentIds.includes(participant.id) ? 'Недавно' : null,
          avatarLabel: labelText,
          searchableText: [
            labelText,
            participant.email ?? '',
            participant.phone ?? '',
          ]
            .join(' ')
            .toLowerCase(),
        };
      }),
    [participants, recentIds],
  );

  const selectedOptions = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return options;
    }

    return options.filter((option) => option.searchableText.includes(normalized));
  }, [options, query]);

  const availableOptions = useMemo(
    () => filteredOptions.filter((option) => !value.includes(option.value)),
    [filteredOptions, value],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const toggleValue = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }

    onChange([...value, optionValue]);
  };

  const summaryText =
    selectedOptions.length === 0
      ? 'Никого не выбрали'
      : `${selectedOptions.length} ${pluralizeParticipants(selectedOptions.length)}`;

  return (
    <>
      <div className="ui-field-group participant-picker">
        {label ? <span className="ui-field-group__label">{label}</span> : null}

        <button
          type="button"
          className={cn('participant-picker__trigger', selectedOptions.length > 0 && 'is-filled')}
          onClick={() => setOpen(true)}
        >
          <div className="participant-picker__trigger-copy">
            <strong>{selectedOptions.length > 0 ? 'Участники выбраны' : 'Выбрать участников'}</strong>
            <span>{summaryText}</span>
          </div>
          <span className="participant-picker__trigger-meta">
            {selectedOptions.length > 0
              ? selectedOptions.slice(0, 2).map((option) => option.label).join(', ')
              : 'Открыть'}
          </span>
        </button>

        {selectedOptions.length > 0 ? (
          <div className="participant-picker__chips">
            {selectedOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="participant-picker__chip"
                onClick={() => toggleValue(option.value)}
              >
                <span>{option.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Выбрать участников"
        description="Быстрый поиск, список выбранных и добавление без лишних шагов."
        panelClassName="participant-picker-modal"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Готово
            </Button>
          </>
        }
      >
        <div className="participant-picker-modal__content">
          <Input
            label="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${searchPlaceholder} или email`}
          />

          {selectedOptions.length > 0 ? (
            <section className="participant-picker-modal__section participant-picker-modal__section--selected">
              <div className="participant-picker-modal__section-head">
                <strong>Выбрано</strong>
                <span>{selectedOptions.length}</span>
              </div>
              <div className="participant-picker__chips participant-picker__chips--modal">
                {selectedOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="participant-picker__chip"
                    onClick={() => toggleValue(option.value)}
                  >
                    <span>{option.label}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="participant-picker-modal__section">
            <div className="participant-picker-modal__section-head">
              <strong>Доступные участники</strong>
              <span>{availableOptions.length}</span>
            </div>

            <div className="participant-picker-modal__list">
              {availableOptions.length > 0 ? (
                availableOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="participant-picker-modal__option"
                    onClick={() => toggleValue(option.value)}
                  >
                    <div className="participant-picker-modal__option-main">
                      <Avatar size="sm" name={option.avatarLabel} />
                      <div className="participant-picker-modal__option-copy">
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </div>
                    </div>
                    <div className="participant-picker-modal__option-side">
                      {option.badge ? <small>{option.badge}</small> : null}
                      <span>Добавить</span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="participant-picker-modal__empty">{emptyText}</p>
              )}
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
