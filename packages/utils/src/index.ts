import type { AccountingPeriod } from '@saas/types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const daysInMonthUtc = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const toSafeStartDay = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 25;
  }

  return Math.min(28, Math.max(1, Math.trunc(value)));
};

export const resolveAccountingPeriod = (
  anchorDate: Date,
  periodStartDay = 25,
): AccountingPeriod => {
  const safeStartDay = toSafeStartDay(periodStartDay);
  const normalizedDate = startOfUtcDay(anchorDate);

  let year = normalizedDate.getUTCFullYear();
  let month = normalizedDate.getUTCMonth();

  if (normalizedDate.getUTCDate() < safeStartDay) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }

  const startDay = Math.min(safeStartDay, daysInMonthUtc(year, month));
  const startAt = new Date(Date.UTC(year, month, startDay));

  let nextMonth = month + 1;
  let nextYear = year;

  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  const nextStartDay = Math.min(safeStartDay, daysInMonthUtc(nextYear, nextMonth));
  const nextPeriodStart = new Date(Date.UTC(nextYear, nextMonth, nextStartDay));
  const endAt = new Date(nextPeriodStart.getTime() - 1);

  return { startAt, endAt };
};

export const isDateRangeOverlapping = (
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean => {
  return firstStart < secondEnd && secondStart < firstEnd;
};

export const calculatePerformancePoints = (
  durationMinutes: number,
  longPerformanceThreshold = 60,
  longPerformancePoints = 3,
  shortPerformancePoints = 2,
): number => {
  return durationMinutes >= longPerformanceThreshold
    ? longPerformancePoints
    : shortPerformancePoints;
};

export const calculateRehearsalPoints = (
  durationMinutes: number,
  rehearsalMinutesPerPoint = 180,
): number => {
  if (rehearsalMinutesPerPoint <= 0) {
    return 0;
  }

  return Number((durationMinutes / rehearsalMinutesPerPoint).toFixed(2));
};

export const getDurationInMinutes = (startsAt: Date, endsAt: Date): number => {
  return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
};

export const addDaysUtc = (date: Date, days: number): Date => {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_IN_MS);
};
