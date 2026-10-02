import { reservationServiceTimeZone } from './reservationTime';

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: reservationServiceTimeZone,
  }).format(new Date(value));
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
  }).format(new Date(`${value}T00:00:00`));
}

export function formatInstantTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: reservationServiceTimeZone,
  }).format(new Date(value));
}

export function formatTime(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 5);
}
