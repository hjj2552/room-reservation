export function timetableDateValue(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function timetableReservationUrl({ startAt, roomId }: { startAt: string; roomId: string }) {
  const params = new URLSearchParams({
    view: 'date',
    date: timetableDateValue(startAt),
    roomId,
  });
  return `/timetable?${params.toString()}`;
}
