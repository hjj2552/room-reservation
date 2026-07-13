const fallbackReservationDurationMinutes = 30;

export const reservationServiceTimeZone = 'Asia/Seoul';
export const noFutureReservationTimeMessage =
  '학기 종료일까지 예약 가능한 미래 운영 시간이 없습니다. 운영 설정을 확인해 주세요.';

const serviceDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: reservationServiceTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const weekdayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface ReservationTimeSettings {
  semesterStartDate: string;
  semesterEndDate: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  availableDaysOfWeek: string[];
  minReservationMinutes: number;
}

export interface ReservationTimeSelection {
  source: 'slot' | 'toolbar';
  roomId: string;
  date: string;
  startAt: string;
  endAt: string;
}

export interface ReservationSlot {
  date: string;
  startMinutes: number;
  endMinutes: number;
  roomId: string;
}

export interface NewReservationSelectionResult {
  selection: ReservationTimeSelection;
  unavailableMessage?: string;
}

// Quick-create defaults should be valid starting points, while manual time input stays flexible.
export function defaultReservationDurationMinutes(
  minReservationMinutes = fallbackReservationDurationMinutes,
) {
  return Math.max(minReservationMinutes || fallbackReservationDurationMinutes, 1);
}

export function reservationSlotUnitMinutes(slotMinutes = fallbackReservationDurationMinutes) {
  return Math.max(slotMinutes || fallbackReservationDurationMinutes, 1);
}

export function slotToReservationSelection(
  slot: ReservationSlot,
  minReservationMinutes = fallbackReservationDurationMinutes,
): ReservationTimeSelection {
  const endMinutes = slot.startMinutes + defaultReservationDurationMinutes(minReservationMinutes);

  return {
    source: 'slot',
    roomId: slot.roomId,
    date: slot.date,
    startAt: `${slot.date}T${minutesToTimeInput(slot.startMinutes)}`,
    endAt: `${slot.date}T${minutesToTimeInput(endMinutes)}`,
  };
}

export function newRequestSelection(
  settings: ReservationTimeSettings,
  now = new Date(),
): NewReservationSelectionResult {
  const emptySelection: ReservationTimeSelection = {
    source: 'toolbar',
    roomId: '',
    date: '',
    startAt: '',
    endAt: '',
  };
  const semesterStartDate = normalizeDateInput(settings.semesterStartDate);
  const semesterEndDate = normalizeDateInput(settings.semesterEndDate);
  const openMinutes = timeValueToMinutes(settings.openTime);
  const closeMinutes = timeValueToMinutes(settings.closeTime);

  if (!semesterStartDate || !semesterEndDate || openMinutes === undefined || closeMinutes === undefined) {
    return { selection: emptySelection, unavailableMessage: noFutureReservationTimeMessage };
  }

  const slotMinutes = reservationSlotUnitMinutes(settings.slotMinutes);
  const minimumMinutes = defaultReservationDurationMinutes(settings.minReservationMinutes);
  // Both endpoints must be slot-aligned, so use the shortest aligned duration that satisfies the minimum.
  const durationMinutes = Math.ceil(minimumMinutes / slotMinutes) * slotMinutes;
  const alignedOpenMinutes = Math.ceil(openMinutes / slotMinutes) * slotMinutes;
  const alignedCloseMinutes = Math.floor(closeMinutes / slotMinutes) * slotMinutes;
  const serviceNow = serviceDateTimeParts(now);
  const firstCandidateDate = serviceNow.date > semesterStartDate ? serviceNow.date : semesterStartDate;
  const availableDays = new Set(settings.availableDaysOfWeek.map(normalizeWeekday));

  if (
    firstCandidateDate > semesterEndDate
    || alignedOpenMinutes + durationMinutes > alignedCloseMinutes
  ) {
    return { selection: emptySelection, unavailableMessage: noFutureReservationTimeMessage };
  }

  for (
    let candidateDate = firstCandidateDate;
    candidateDate <= semesterEndDate;
    candidateDate = addDaysInputValue(candidateDate, 1)
  ) {
    if (!availableDays.has(weekdayCode(candidateDate))) continue;

    let startMinutes = alignedOpenMinutes;
    if (candidateDate === serviceNow.date) {
      const slotMilliseconds = slotMinutes * 60_000;
      const currentMilliseconds = (
        (serviceNow.hour * 60 + serviceNow.minute) * 60 + serviceNow.second
      ) * 1_000 + now.getMilliseconds();
      if (currentMilliseconds >= alignedOpenMinutes * 60_000) {
        startMinutes = Math.floor(currentMilliseconds / slotMilliseconds + 1) * slotMinutes;
      }
    }

    const endMinutes = startMinutes + durationMinutes;
    if (startMinutes < alignedOpenMinutes || endMinutes > alignedCloseMinutes) continue;

    return {
      selection: {
        source: 'toolbar',
        roomId: '',
        date: candidateDate,
        startAt: `${candidateDate}T${minutesToTimeInput(startMinutes)}`,
        endAt: `${candidateDate}T${minutesToTimeInput(endMinutes)}`,
      },
    };
  }

  return { selection: emptySelection, unavailableMessage: noFutureReservationTimeMessage };
}

// datetime-local values in reservation panels represent service-local wall time, not browser-local time.
export function fromServiceDateTimeLocal(value: string) {
  if (!value) return value;
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return `${withSeconds}+09:00`;
}

function serviceDateTimeParts(value: Date) {
  const parts = serviceDateTimeFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function normalizeDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function normalizeWeekday(value: string) {
  return value.trim().toUpperCase().slice(0, 3);
}

function weekdayCode(value: string) {
  return weekdayCodes[new Date(`${value}T00:00:00Z`).getUTCDay()];
}

function addDaysInputValue(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesToTimeInput(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeValueToMinutes(value?: string) {
  const match = value?.match(/^(\d{2}):(\d{2})/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}
