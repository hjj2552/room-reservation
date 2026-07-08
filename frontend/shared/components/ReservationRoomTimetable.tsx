import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReservationStatus } from '../api/types';
import { hexToTint } from '../utils/color';
import { statusLabels } from '../utils/labels';
import {
  TIMETABLE_COMPACT_BLOCK_HEIGHT,
  TIMETABLE_GRID_MINUTES,
  TIMETABLE_MINUTE_HEIGHT,
  type TimetableReservation,
  type TimetableRoom,
  buildSlots,
  clippedBlockPosition,
  clockToMinutes,
  formatClock,
  timetableGridStyle,
} from './ReservationDateTimetable';
import { StatusBadge } from './StatusBadge';

const fallbackOpenTime = '09:00';
const fallbackCloseTime = '18:00';
const timetableTimeZone = 'Asia/Seoul';
const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

interface ReservationRoomTimetableProps {
  room?: TimetableRoom;
  reservations: TimetableReservation[];
  weekStart: string;
  openTime?: string;
  closeTime?: string;
  reservationSlotMinutes?: number;
  minReservationMinutes?: number;
  highlightedReservationId?: string | null;
  onEmptySlotClick?: (slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) => void;
  onReservationClick?: (reservation: TimetableReservation) => void;
  statusLabelOverride?: Partial<Record<ReservationStatus, string>>;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatShortDate(date: string) {
  return date.slice(5).replace('-', '/');
}

function dateTimeToDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timetableTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function ReservationRoomTimetable({
  room,
  reservations,
  weekStart,
  openTime = fallbackOpenTime,
  closeTime = fallbackCloseTime,
  reservationSlotMinutes = TIMETABLE_GRID_MINUTES,
  minReservationMinutes = TIMETABLE_GRID_MINUTES,
  highlightedReservationId,
  onEmptySlotClick,
  onReservationClick,
  statusLabelOverride,
}: ReservationRoomTimetableProps) {
  const navigate = useNavigate();
  const openMinutes = clockToMinutes(openTime || fallbackOpenTime);
  const closeMinutes = Math.max(clockToMinutes(closeTime || fallbackCloseTime), openMinutes + 60);
  const slots = useMemo(
    () => buildSlots(openMinutes, closeMinutes, TIMETABLE_GRID_MINUTES),
    [openMinutes, closeMinutes],
  );
  // Empty-slot buttons may be coarser than the visual grid so shortcuts never create invalid reservations.
  const emptySlotStepMinutes = Math.max(TIMETABLE_GRID_MINUTES, reservationSlotMinutes || TIMETABLE_GRID_MINUTES);
  const emptySlots = useMemo(
    () => buildSlots(openMinutes, closeMinutes, emptySlotStepMinutes),
    [openMinutes, closeMinutes, emptySlotStepMinutes],
  );
  const days = useMemo(
    () => dayLabels.map((label, index) => ({ label, date: addDays(weekStart, index) })),
    [weekStart],
  );
  const bodyHeight = (closeMinutes - openMinutes) * TIMETABLE_MINUTE_HEIGHT;
  const reservationsByDate = useMemo(() => {
    const grouped = new Map<string, TimetableReservation[]>();
    reservations.forEach((reservation) => {
      const date = dateTimeToDate(reservation.startAt);
      grouped.set(date, [...(grouped.get(date) || []), reservation]);
    });
    grouped.forEach((items) => items.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return grouped;
  }, [reservations]);

  if (!room) {
    return <div className="state-box empty">표시할 활성 강의실이 없습니다.</div>;
  }

  return (
    <div className="timetable-card" data-testid="reservation-room-timetable">
      <div className="timetable-summary" aria-live="polite">
        <strong>{room.name}</strong>
        <span>
          {weekStart}-{addDays(weekStart, 6)} · {formatClock(openMinutes)}-{formatClock(closeMinutes)} · 예약{' '}
          {reservations.length}건
        </span>
      </div>
      <div className="timetable-scroll" role="region" aria-label={`${room.name} 주간 예약 시간표`}>
        <div className="timetable-grid" style={timetableGridStyle(days.length)}>
          <div className="timetable-corner">시간</div>
          {days.map((day) => (
            <div key={day.date} className="timetable-day-header">
              <strong>{day.label}</strong>
              <span>{formatShortDate(day.date)}</span>
            </div>
          ))}
          <div className="timetable-time-column" style={{ height: bodyHeight }}>
            {slots.map((slot) => (
              <div
                key={slot}
                className={`timetable-time-label${
                  slot === openMinutes ? ' is-first' : slot === closeMinutes ? ' is-last' : ''
                }`}
                style={{ top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT }}
              >
                {formatClock(slot)}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day.date} className="timetable-room-column" style={{ height: bodyHeight }}>
              {emptySlots.slice(0, -1).map((slot, index) => {
                if (slot + minReservationMinutes > closeMinutes) return null;
                const nextSlot = emptySlots[index + 1];
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
                        date: day.date,
                        startMinutes: slot,
                        endMinutes: nextSlot,
                        roomId: room.id,
                      })
                    }
                    aria-label={`${room.name} ${day.label} ${formatClock(slot)}-${formatClock(nextSlot)} 예약 신청`}
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
              {(reservationsByDate.get(day.date) || []).map((reservation) => {
                const position = clippedBlockPosition(reservation, openMinutes, closeMinutes);
                if (!position.visible) return null;
                const blockClassName = `reservation-block reservation-block-${reservation.status.toLowerCase()}${
                  position.height < TIMETABLE_COMPACT_BLOCK_HEIGHT ? ' reservation-block-compact' : ''
                }${reservation.id === highlightedReservationId ? ' reservation-block-highlighted' : ''}`;

                return (
                  <button
                    key={reservation.id}
                    type="button"
                    className={blockClassName}
                    style={{
                      top: position.top,
                      height: position.height,
                      borderColor: reservation.seriesColor || undefined,
                      backgroundColor: reservation.seriesColor ? hexToTint(reservation.seriesColor) : undefined,
                    }}
                    onClick={() =>
                      onReservationClick ? onReservationClick(reservation) : navigate(`/admin/reservations/${reservation.id}`)
                    }
                    aria-label={`${room.name} ${day.label} ${position.startLabel}-${position.endLabel} ${reservation.purpose} ${statusLabelOverride?.[reservation.status] || statusLabels[reservation.status]}`}
                    data-testid="reservation-room-timetable-block"
                  >
                    <span className="reservation-block-title">{reservation.purpose || reservation.applicantName}</span>
                    {reservation.seriesLabel ? (
                      <span
                        className="reservation-block-series"
                        style={reservation.seriesColor ? {
                          borderColor: reservation.seriesColor,
                        } : undefined}
                      >
                        {reservation.seriesLabel}
                      </span>
                    ) : null}
                    <span className="reservation-block-meta">
                      <span>
                        {position.startLabel}-{position.endLabel}
                      </span>
                      <span>{reservation.applicantName}</span>
                    </span>
                    <span className="reservation-block-footer">
                      <StatusBadge status={reservation.status} label={statusLabelOverride?.[reservation.status]} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {reservations.length === 0 ? <p className="compact-note muted">이 주에는 등록된 예약이 없습니다.</p> : null}
    </div>
  );
}
