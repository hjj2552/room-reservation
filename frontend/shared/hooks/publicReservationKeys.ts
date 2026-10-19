export const publicReservationKeys = {
  rooms: ['public', 'rooms'] as const,
  settings: ['public', 'settings'] as const,
  weeklyRoom: (roomId: string) => ['public', 'weekly-reservations', roomId] as const,
  details: ['public', 'reservation'] as const,
  weekly: (roomId: string, weekStart: string) => ['public', 'weekly-reservations', roomId, weekStart] as const,
  detail: (reservationId: string) => ['public', 'reservation', reservationId] as const,
};
