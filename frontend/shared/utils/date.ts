import { reservationServiceTimeZone } from './reservationTime';

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: reservationServiceTimeZone,
  }).format(new Date(value));
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export function formatTime(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 5);
}

export function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${value}:00${sign}${hours}:${minutes}`;
}

export function toStartOfDayOffset(value?: string) {
  return value ? fromDateTimeLocal(`${value}T00:00`) : undefined;
}

export function toEndOfDayOffset(value?: string) {
  return value ? fromDateTimeLocal(`${value}T23:59`) : undefined;
}
