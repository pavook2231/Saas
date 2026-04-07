import { useMemo } from 'react';

import { MultiSelect } from '@/components/ui/multi-select';
import {
  participantDisplayName,
  type ParticipantRecord,
} from '@/app/lib/api/operations';

type ParticipantPickerProps = {
  emptyText?: string;
  label?: string;
  participants: ParticipantRecord[];
  searchPlaceholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
};

export function ParticipantPicker({
  emptyText = 'Участники не найдены',
  label = 'Участники',
  participants,
  searchPlaceholder = 'Найти участника',
  value,
  onChange,
}: ParticipantPickerProps) {
  const options = useMemo(
    () =>
      participants.map((participant) => ({
        value: participant.id,
        label: participantDisplayName(participant),
        description: participant.userId
          ? `Аккаунт · ${participant.email ?? 'без email'}`
          : `Без аккаунта · ${participant.email ?? participant.phone ?? 'контакт не указан'}`,
        badge: participant.userId ? 'User' : 'Participant',
      })),
    [participants],
  );

  return (
    <MultiSelect
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Выберите участников"
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
    />
  );
}

