import { expect, test } from '@playwright/test';
import {
  INTERACTION_INTERVAL_MINUTES,
  defaultOperatingTimeRange,
  defaultSuggestedDurationMinutes,
  fromServiceDateTimeLocal,
  isPublicReservationCandidateInPast,
  newRequestSelection,
  noFutureReservationTimeMessage,
  slotToReservationSelection,
  toServiceDateTimeLocal,
  type ReservationTimeSettings,
} from '../../shared/utils/reservationTime';

const settings: ReservationTimeSettings = {
  semesterStartDate: '2026-07-01',
  semesterEndDate: '2026-07-31',
  openTime: '09:00',
  closeTime: '18:00',
  slotMinutes: 30,
  availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  minReservationMinutes: 30,
  maxReservationMinutes: 240,
};

test('uses a fixed 30-minute timetable interaction interval', () => {
  expect(INTERACTION_INTERVAL_MINUTES).toBe(30);
  expect(defaultSuggestedDurationMinutes(20)).toBe(30);
  expect(defaultSuggestedDurationMinutes(45)).toBe(45);
  expect(defaultSuggestedDurationMinutes(60)).toBe(60);
  expect(defaultSuggestedDurationMinutes(120)).toBe(120);
});

test('uses the operating start before opening time', () => {
  expectSelection('2026-07-13T08:15:00+09:00', '2026-07-13T09:00', '2026-07-13T09:30');
});

test('rounds an in-hours instant to the nearest strictly future slot', () => {
  expectSelection('2026-07-13T16:45:00+09:00', '2026-07-13T17:00', '2026-07-13T17:30');
});

test('handles the instant immediately before and exactly on a slot boundary', () => {
  expectSelection('2026-07-13T16:29:59.999+09:00', '2026-07-13T16:30', '2026-07-13T17:00');
  expectSelection('2026-07-13T16:30:00+09:00', '2026-07-13T17:00', '2026-07-13T17:30');
});

test('uses the last valid slot before it passes and moves after it passes', () => {
  expectSelection('2026-07-13T17:29:59.999+09:00', '2026-07-13T17:30', '2026-07-13T18:00');
  expectSelection('2026-07-13T17:30:00+09:00', '2026-07-14T09:00', '2026-07-14T09:30');
});

test('moves after closing time to the next operating day', () => {
  expectSelection('2026-07-13T18:05:00+09:00', '2026-07-14T09:00', '2026-07-14T09:30');
});

test('skips weekends and configured non-operating weekdays', () => {
  expectSelection('2026-07-12T12:00:00+09:00', '2026-07-13T09:00', '2026-07-13T09:30');
  expectSelection(
    '2026-07-13T12:00:00+09:00',
    '2026-07-14T09:00',
    '2026-07-14T09:30',
    { availableDaysOfWeek: ['TUESDAY'] },
  );
});

test('starts at the first operating day on or after the semester start', () => {
  expectSelection(
    '2026-06-25T12:00:00+09:00',
    '2026-07-01T09:00',
    '2026-07-01T09:30',
  );
});

test('returns no arbitrary date or time when no future semester slot exists', () => {
  const result = newRequestSelection(settings, new Date('2026-08-01T00:00:00+09:00'));

  expect(result.unavailableMessage).toBe(noFutureReservationTimeMessage);
  expect(result.selection).toEqual({
    source: 'toolbar',
    roomId: '',
    date: '',
    startAt: '',
    endAt: '',
  });
});

test('uses the configured minimum when it is longer than the 30-minute suggestion floor', () => {
  expectSelection(
    '2026-07-13T10:05:00+09:00',
    '2026-07-13T10:30',
    '2026-07-13T11:15',
    { minReservationMinutes: 45, maxReservationMinutes: 120, slotMinutes: 15 },
  );
});

test('slot selection preserves the full interval supplied by the timetable', () => {
  expect(slotToReservationSelection({
    date: '2026-07-13',
    startMinutes: 600,
    endMinutes: 645,
    roomId: 'room-1',
  })).toMatchObject({
    startAt: '2026-07-13T10:00',
    endAt: '2026-07-13T10:45',
  });
});

test('recurrence defaults use the operating start and suggested duration', () => {
  expect(defaultOperatingTimeRange({
    ...settings,
    slotMinutes: 15,
    minReservationMinutes: 45,
    maxReservationMinutes: 120,
  })).toEqual({ startTime: '09:00', endTime: '09:45' });
});

test('detects public past candidates using the Seoul service instant', () => {
  const now = new Date('2026-07-13T01:15:00Z');
  expect(isPublicReservationCandidateInPast('2026-07-13', 600, now)).toBe(true);
  expect(isPublicReservationCandidateInPast('2026-07-13', 630, now)).toBe(false);
});

test('serializes service-local reservation inputs with the Seoul offset', () => {
  expect(fromServiceDateTimeLocal('2026-07-14T09:00')).toBe('2026-07-14T09:00:00+09:00');
  expect(toServiceDateTimeLocal('2026-07-14T00:00:00Z')).toBe('2026-07-14T09:00');
});

function expectSelection(
  now: string,
  startAt: string,
  endAt: string,
  overrides: Partial<ReservationTimeSettings> = {},
) {
  const result = newRequestSelection({ ...settings, ...overrides }, new Date(now));
  expect(result.unavailableMessage).toBeUndefined();
  expect(result.selection.startAt).toBe(startAt);
  expect(result.selection.endAt).toBe(endAt);
}
