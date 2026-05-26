import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminRoom, ReservationListItem } from '../api/types';
import { statusLabels } from '../utils/labels';
import { StatusBadge } from './StatusBadge';

export const TIMETABLE_MINUTE_HEIGHT = 1.35;
const fallbackOpenTime = '09:00';
const fallbackCloseTime = '18:00';
const timetableTimeZone = 'Asia/Seoul';

interface ReservationDateTimetableProps {
  rooms: AdminRoom[];
  reservations: ReservationListItem[];
  selectedDate: string;
  openTime?: string;
  closeTime?: string;
  slotMinutes?: number;
  highlightedReservationId?: string | null;
  onEmptySlotClick?: (slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) => void;
}

export function clockToMinutes(value?: string) {
  const [hour = '0', minute = '0'] = (value || '').slice(0, 5).split(':');
  return Number(hour) * 60 + Number(minute);
}

export function dateTimeToClockMinutes(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timetableTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function formatClock(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function buildSlots(openMinutes: number, closeMinutes: number, slotMinutes: number) {
  const slots: number[] = [];
  for (let minutes = openMinutes; minutes <= closeMinutes; minutes += slotMinutes) {
    slots.push(minutes);
  }
  if (slots[slots.length - 1] !== closeMinutes) {
    slots.push(closeMinutes);
  }
  return slots;
}

export function clippedBlockPosition(reservation: ReservationListItem, openMinutes: number, closeMinutes: number) {
  const startMinutes = dateTimeToClockMinutes(reservation.startAt);
  const endMinutes = dateTimeToClockMinutes(reservation.endAt);
  const visibleStart = Math.max(startMinutes, openMinutes);
  const visibleEnd = Math.min(endMinutes, closeMinutes);

  return {
    top: (visibleStart - openMinutes) * TIMETABLE_MINUTE_HEIGHT,
    height: Math.max((visibleEnd - visibleStart) * TIMETABLE_MINUTE_HEIGHT, 34),
    visible: visibleEnd > visibleStart,
    startLabel: formatClock(startMinutes),
    endLabel: formatClock(endMinutes),
  };
}

export function ReservationDateTimetable({
  rooms,
  reservations,
  selectedDate,
  openTime = fallbackOpenTime,
  closeTime = fallbackCloseTime,
  slotMinutes = 60,
  highlightedReservationId,
  onEmptySlotClick,
}: ReservationDateTimetableProps) {
  const navigate = useNavigate();
  const openMinutes = clockToMinutes(openTime || fallbackOpenTime);
  const closeMinutes = Math.max(clockToMinutes(closeTime || fallbackCloseTime), openMinutes + 60);
  const normalizedSlotMinutes = slotMinutes <= 30 ? 30 : 60;
  const slots = useMemo(
    () => buildSlots(openMinutes, closeMinutes, normalizedSlotMinutes),
    [openMinutes, closeMinutes, normalizedSlotMinutes],
  );
  const bodyHeight = (closeMinutes - openMinutes) * TIMETABLE_MINUTE_HEIGHT;
  const roomIds = useMemo(() => new Set(rooms.map((room) => room.id)), [rooms]);
  const reservationsByRoom = useMemo(() => {
    const grouped = new Map<string, ReservationListItem[]>();
    reservations
      .filter((reservation) => roomIds.has(reservation.roomId))
      .forEach((reservation) => {
        grouped.set(reservation.roomId, [...(grouped.get(reservation.roomId) || []), reservation]);
      });
    grouped.forEach((items) => items.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return grouped;
  }, [reservations, roomIds]);

  if (rooms.length === 0) {
    return <div className="state-box empty">표시할 활성 강의실이 없습니다.</div>;
  }

  return (
    <div className="timetable-card" data-testid="reservation-date-timetable">
      <div className="timetable-summary" aria-live="polite">
        <strong>{selectedDate}</strong>
        <span>
          {formatClock(openMinutes)}-{formatClock(closeMinutes)} · 활성 강의실 {rooms.length}개 · 예약{' '}
          {reservations.filter((reservation) => roomIds.has(reservation.roomId)).length}건
        </span>
      </div>
      <div className="timetable-scroll" role="region" aria-label={`${selectedDate} 날짜별 예약 시간표`}>
        <div
          className="timetable-grid"
          style={{ gridTemplateColumns: `86px repeat(${rooms.length}, minmax(180px, 1fr))` }}
        >
          <div className="timetable-corner">시간</div>
          {rooms.map((room) => (
            <div key={room.id} className="timetable-room-header">
              <strong>{room.name}</strong>
              {room.location ? <span>{room.location}</span> : null}
            </div>
          ))}
          <div className="timetable-time-column" style={{ height: bodyHeight }}>
            {slots.map((slot) => (
              <div
                key={slot}
                className="timetable-time-label"
                style={{ top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT }}
              >
                {formatClock(slot)}
              </div>
            ))}
          </div>
          {rooms.map((room) => (
            <div key={room.id} className="timetable-room-column" style={{ height: bodyHeight }}>
              {slots.slice(0, -1).map((slot, index) => {
                const nextSlot = slots[index + 1];
                return (
                  <button
                    key={`empty-${slot}`}
                    type="button"
                    className="timetable-empty-slot"
                    style={{
                      top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT,
                      height: (nextSlot - slot) * TIMETABLE_MINUTE_HEIGHT,
                    }}
                    onClick={() =>
                      onEmptySlotClick?.({
                        date: selectedDate,
                        startMinutes: slot,
                        endMinutes: nextSlot,
                        roomId: room.id,
                      })
                    }
                    aria-label={`${room.name} ${formatClock(slot)}-${formatClock(nextSlot)} 예약 등록`}
                    data-testid="timetable-empty-slot"
                  />
                );
              })}
              {slots.map((slot) => (
                <div
                  key={slot}
                  className="timetable-grid-line"
                  style={{ top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT }}
                />
              ))}
              {(reservationsByRoom.get(room.id) || []).map((reservation) => {
                const position = clippedBlockPosition(reservation, openMinutes, closeMinutes);
                if (!position.visible) return null;

                return (
                  <button
                    key={reservation.id}
                    type="button"
                    className={`reservation-block reservation-block-${reservation.status.toLowerCase()}${
                      reservation.id === highlightedReservationId ? ' reservation-block-highlighted' : ''
                    }`}
                    style={{ top: position.top, height: position.height }}
                    onClick={() => navigate(`/reservations/${reservation.id}`)}
                    aria-label={`${room.name} ${position.startLabel}-${position.endLabel} ${reservation.purpose} ${statusLabels[reservation.status]}`}
                    data-testid="reservation-timetable-block"
                  >
                    <span className="reservation-block-title">{reservation.purpose || reservation.applicantName}</span>
                    <span className="reservation-block-meta">
                      {position.startLabel}-{position.endLabel}
                    </span>
                    <span className="reservation-block-footer">
                      <span>{reservation.applicantName}</span>
                      <StatusBadge status={reservation.status} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
