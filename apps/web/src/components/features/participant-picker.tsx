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
  recentIds?: string[];
  searchPlaceholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
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

export function ParticipantPicker({
  emptyText = 'Участники не найдены',
  label = 'Участники',
  participants,
  recentIds = [],
  searchPlaceholder = 'Найти участника',
  value,
  onChange,
}: ParticipantPickerProps) {
  const options = useMemo(
    () =>
      sortParticipants(participants, recentIds).map((participant) => ({
        value: participant.id,
        label: participantDisplayName(participant),
        description: participant.userId
          ? `Аккаунт · ${participant.email ?? 'без email'}`
          : `Без аккаунта · ${participant.email ?? participant.phone ?? 'контакт не указан'}`,
        badge: recentIds.includes(participant.id)
          ? 'Недавно'
          : participant.userId
            ? 'User'
            : 'Participant',
      })),
    [participants, recentIds],
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
