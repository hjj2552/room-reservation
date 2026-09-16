import { timetableDateValue } from './timetable';

interface TimetableReturn {
  url: string;
  index: number | null;
}

export interface PublicReservationNavigationState {
  timetableReturn?: TimetableReturn;
  editSuccess?: 'REQUESTED' | 'CONFIRMED';
}

export function publicTimetableReturn(search: string): TimetableReturn {
  const params = new URLSearchParams(search);
  // Public timetable supports these parameters; do not forward unrelated state.
  for (const key of [...params.keys()]) {
    if (!['view', 'date', 'weekStart', 'roomViewRoomId'].includes(key)) params.delete(key);
  }
  return {
    url: `/timetable${params.size ? `?${params}` : ''}`,
    index: Number.isSafeInteger(window.history.state?.idx) ? window.history.state.idx : null,
  };
}

export function publicReservationTimetableUrl(reservation: { startAt: string; room: { id: string } }) {
  // Room view accepts roomViewRoomId and derives the week from date when omitted.
  return `/timetable?${new URLSearchParams({
    view: 'room', date: timetableDateValue(reservation.startAt), roomViewRoomId: reservation.room.id,
  })}`;
}

export function canReturnToPublicTimetable(context: TimetableReturn | undefined) {
  if (!context || context.index === null || !Number.isSafeInteger(context.index)) return false;
  // React Router preserves idx when replacing detail/edit or consuming route state.
  return window.history.state?.idx === context.index + 1
    && (context.url === '/timetable' || context.url.startsWith('/timetable?'));
}
