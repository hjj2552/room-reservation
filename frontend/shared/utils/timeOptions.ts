import {
  RESERVATION_INCREMENT_MINUTES,
  TIMETABLE_GRID_MINUTES,
  minutesToTimeInput,
  timeValueToMinutes,
} from './reservationTime';

export interface TimeOption {
  value: string;
  label: string;
  existing?: boolean;
}

export function generateTimeOptions(
  startMinutes: number,
  endMinutes: number,
  incrementMinutes: number,
): TimeOption[] {
  const options: TimeOption[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += incrementMinutes) {
    options.push({ value: minutesToTimeInput(minutes), label: minutesToTimeInput(minutes) });
  }
  return options;
}

export function operatingTimeOptions() {
  return generateTimeOptions(0, 23 * 60 + 30, TIMETABLE_GRID_MINUTES);
}

export function reservationStartTimeOptions(
  openTime: string,
  closeTime: string,
  minReservationMinutes: number,
) {
  const openMinutes = timeValueToMinutes(openTime);
  const closeMinutes = timeValueToMinutes(closeTime);
  if (openMinutes === undefined || closeMinutes === undefined) return [];
  return generateTimeOptions(
    openMinutes,
    closeMinutes - minReservationMinutes,
    RESERVATION_INCREMENT_MINUTES,
  );
}

export function reservationEndTimeOptions(
  startTime: string,
  closeTime: string,
  minReservationMinutes: number,
  maxReservationMinutes: number,
) {
  const startMinutes = timeValueToMinutes(startTime);
  const closeMinutes = timeValueToMinutes(closeTime);
  if (startMinutes === undefined || closeMinutes === undefined) return [];
  return generateTimeOptions(
    startMinutes + minReservationMinutes,
    Math.min(startMinutes + maxReservationMinutes, closeMinutes),
    RESERVATION_INCREMENT_MINUTES,
  );
}

export function includeExistingTime(options: TimeOption[], existingTime: string) {
  if (!existingTime || options.some((option) => option.value === existingTime)) return options;
  return [...options, { value: existingTime, label: `${existingTime} (기존 시간)`, existing: true }];
}
