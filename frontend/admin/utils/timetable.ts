import { timetableDateValue } from '../../shared/utils/timetable';

export function timetableReservationUrl({ startAt, roomId }: { startAt: string; roomId: string }) {
  const params = new URLSearchParams({
    view: 'date',
    date: timetableDateValue(startAt),
    roomId,
  });
  return `/admin/timetable?${params.toString()}`;
}

export function timetableDuplicateReservationUrl(reservationId: string) {
  const params = new URLSearchParams({
    duplicateReservationId: reservationId,
  });
  return `/admin/timetable?${params.toString()}`;
}
