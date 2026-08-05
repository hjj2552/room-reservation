import { dayLabels } from './labels';

export const WEEKDAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const weekdayOrderIndex = new Map<string, number>(
  WEEKDAY_ORDER.map((day, index) => [day, index]),
);

function normalizeWeekdayCode(day: string) {
  return day.trim().toUpperCase().slice(0, 3);
}

export function canonicalizeWeekdayCodes(days: readonly string[]) {
  return [...new Set(days.map(normalizeWeekdayCode))].sort((left, right) => {
    const leftIndex = weekdayOrderIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = weekdayOrderIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

export function toggleWeekday(days: readonly string[], day: string) {
  const normalizedDay = normalizeWeekdayCode(day);
  return canonicalizeWeekdayCodes(
    days.includes(normalizedDay)
      ? days.filter((item) => item !== normalizedDay)
      : [...days, normalizedDay],
  );
}

export function formatDayCodes(daysOfWeek: string) {
  return canonicalizeWeekdayCodes(daysOfWeek.split(','))
    .map((day) => dayLabels[day] || day)
    .join(', ');
}
