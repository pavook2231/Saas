export const venueOptions = ['БЗ', 'МЗ', 'Реп зал', 'Фойе'] as const;

export type VenueName = (typeof venueOptions)[number];

export const venueToneClass: Record<VenueName, string> = {
  'БЗ': 'is-bz',
  'МЗ': 'is-mz',
  'Реп зал': 'is-rehearsal-room',
  'Фойе': 'is-foyer',
};

export const isVenueName = (value: string | null | undefined): value is VenueName =>
  Boolean(value && venueOptions.includes(value as VenueName));

