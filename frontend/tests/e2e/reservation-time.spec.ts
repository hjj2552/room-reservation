import { expect, test } from '@playwright/test';
import { formatDateTime } from '../../shared/utils/date';
import {
  INTERACTION_INTERVAL_MINUTES,
  RESERVATION_INCREMENT_MINUTES,
  defaultOperatingTimeRange,
  defaultSuggestedDurationMinutes,
  fromServiceDateTimeLocal,
  isPastServiceReservationTime,
  newRequestSelection,
  noFutureReservationTimeMessage,
  slotToReservationSelection,
  toServiceEndOfDayOffset,
  toServiceDateTimeLocal,
  toServiceStartOfDayOffset,
  type ReservationTimeSettings,
} from '../../shared/utils/reservationTime';
import {
  includeExistingTime,
  operatingTimeOptions,
  reservationEndTimeOptions,
  reservationStartTimeOptions,
} from '../../shared/utils/timeOptions';

const settings: ReservationTimeSettings = {
  semesterStartDate: '2026-07-01',
  semesterEndDate: '2026-07-31',
  openTime: '09:00',
  closeTime: '18:00',
  availableDaysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  minReservationMinutes: 30,
  maxReservationMinutes: 240,
};

test('uses a fixed 30-minute timetable interaction interval', () => {
  expect(INTERACTION_INTERVAL_MINUTES).toBe(30);
  expect(RESERVATION_INCREMENT_MINUTES).toBe(5);
  expect(defaultSuggestedDurationMinutes(30)).toBe(30);
  expect(defaultSuggestedDurationMinutes(35)).toBe(35);
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
    { minReservationMinutes: 45, maxReservationMinutes: 120 },
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
    minReservationMinutes: 45,
    maxReservationMinutes: 120,
  })).toEqual({ startTime: '09:00', endTime: '09:45' });
});

test('builds reservation choices at exactly five-minute increments within min and max limits', () => {
  const starts = reservationStartTimeOptions('09:00', '10:00', 30);
  expect(starts.map((option) => option.value)).toEqual([
    '09:00', '09:05', '09:10', '09:15', '09:20', '09:25', '09:30',
  ]);
  expect(starts).not.toContainEqual(expect.objectContaining({ value: '09:01' }));

  const ends = reservationEndTimeOptions('09:10', '10:00', 35, 45);
  expect(ends.map((option) => option.value)).toEqual(['09:45', '09:50', '09:55']);
});

test('builds operating choices at exactly thirty-minute increments', () => {
  const options = operatingTimeOptions();
  expect(options[0].value).toBe('00:00');
  expect(options[1].value).toBe('00:30');
  expect(options.at(-1)?.value).toBe('23:30');
  expect(options).not.toContainEqual(expect.objectContaining({ value: '00:05' }));
});

test('keeps an existing reservation time visible when it is outside current choices', () => {
  expect(includeExistingTime([], '08:55')).toEqual([
    { value: '08:55', label: '08:55 (기존 시간)', existing: true },
  ]);
});

test('serializes service-local reservation inputs with the Seoul offset', () => {
  expect(fromServiceDateTimeLocal('2026-07-14T09:00')).toBe('2026-07-14T09:00:00+09:00');
  expect(toServiceDateTimeLocal('2026-07-14T00:00:00Z')).toBe('2026-07-14T09:00');
});

test('formats instants and admin date boundaries in Seoul', () => {
  const formatted = formatDateTime('2026-07-13T15:30:00Z');
  expect(formatted).toContain('2026. 7. 14.');
  expect(formatted).toContain('12:30');
  expect(toServiceStartOfDayOffset('2026-07-14')).toBe('2026-07-14T00:00:00+09:00');
  const inclusiveEnd = toServiceEndOfDayOffset('2026-07-14');
  expect(inclusiveEnd).toBe('2026-07-14T23:59:59.999999+09:00');
  expect('2026-07-14T23:59:59.999998+09:00' <= (inclusiveEnd ?? '')).toBe(true);
});

test('checks public past input against the Seoul service-local instant', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  expect(isPastServiceReservationTime('2026-07-14T08:55', now)).toBe(true);
  expect(isPastServiceReservationTime('2026-07-14T09:00', now)).toBe(false);
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
