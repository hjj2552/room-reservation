import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { ReservationStatus } from '../api/types';
import { hexToTint } from '../utils/color';
import { statusLabels } from '../utils/labels';
import {
  TIMETABLE_GRID_MINUTES,
  defaultSuggestedDurationMinutes,
} from '../utils/reservationTime';
import { StatusBadge } from './StatusBadge';

export const TIMETABLE_MINUTE_HEIGHT = 1.6;
export { TIMETABLE_GRID_MINUTES } from '../utils/reservationTime';
export const TIMETABLE_TIME_COLUMN_WIDTH = 64;
export const TIMETABLE_MIN_COLUMN_WIDTH = 164;
export const TIMETABLE_COMPACT_BLOCK_HEIGHT = 72;
const fallbackOpenTime = '09:00';
const fallbackCloseTime = '18:00';
const timetableTimeZone = 'Asia/Seoul';

export interface TimetableRoom {
  id: string;
  name: string;
  location?: string | null;
  capacity?: number | null;
  description?: string | null;
}

export interface TimetableReservation {
  id: string;
  roomId: string;
  roomName?: string;
  applicantName: string;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  seriesLabel?: string | null;
  seriesColor?: string | null;
}

export interface TimetableAvailability {
  context: 'PUBLIC' | 'ADMIN';
  availableDaysOfWeek: string[];
  publicAvailableDaysOfWeek: string[];
  publicOpenTime: string;
  publicCloseTime: string;
}

export type TimetableAvailabilityState = 'available' | 'public-unavailable' | 'operating-unavailable';

interface ReservationDateTimetableProps {
  rooms: TimetableRoom[];
  reservations: TimetableReservation[];
  selectedDate: string;
  openTime?: string;
  closeTime?: string;
  minReservationMinutes?: number;
  availability?: TimetableAvailability;
  highlightedReservationId?: string | null;
  onEmptySlotClick?: (slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) => void;
  onReservationClick?: (reservation: TimetableReservation) => void;
  onRoomInfoClick?: (room: TimetableRoom) => void;
  statusLabelOverride?: Partial<Record<ReservationStatus, string>>;
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

export function timetableHoursSummary(
  openTime: string,
  closeTime: string,
  availability?: TimetableAvailability,
) {
  const normalizedOpenTime = openTime.slice(0, 5);
  const normalizedCloseTime = closeTime.slice(0, 5);
  const publicOpenTime = availability?.publicOpenTime.slice(0, 5);
  const publicCloseTime = availability?.publicCloseTime.slice(0, 5);
  const operatingHours = `운영 시간 ${normalizedOpenTime}–${normalizedCloseTime}`;

  return publicOpenTime && publicCloseTime
    && (publicOpenTime !== normalizedOpenTime || publicCloseTime !== normalizedCloseTime)
    ? `${operatingHours} · 신청 가능 시간 ${publicOpenTime}–${publicCloseTime}`
    : operatingHours;
}

export function buildSlots(openMinutes: number, closeMinutes: number, incrementMinutes: number) {
  const slots: number[] = [];
  for (let minutes = openMinutes; minutes <= closeMinutes; minutes += incrementMinutes) {
    slots.push(minutes);
  }
  if (slots[slots.length - 1] !== closeMinutes) {
    slots.push(closeMinutes);
  }
  return slots;
}

function weekdayCode(date: string) {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function timetableDayAvailability(
  date: string,
  availability?: TimetableAvailability,
): TimetableAvailabilityState {
  if (!availability) return 'available';
  const day = weekdayCode(date);
  if (!availability.availableDaysOfWeek.some((value) => value.slice(0, 3).toUpperCase() === day)) return 'operating-unavailable';
  if (!availability.publicAvailableDaysOfWeek.some((value) => value.slice(0, 3).toUpperCase() === day)) return 'public-unavailable';
  return 'available';
}

export function timetableSlotAvailability(
  date: string,
  startMinutes: number,
  endMinutes: number,
  availability?: TimetableAvailability,
): TimetableAvailabilityState {
  const dayState = timetableDayAvailability(date, availability);
  if (dayState !== 'available' || !availability) return dayState;
  if (
    startMinutes < clockToMinutes(availability.publicOpenTime)
    || endMinutes > clockToMinutes(availability.publicCloseTime)
  ) return 'public-unavailable';
  return 'available';
}

export function isTimetableSlotSelectable(
  state: TimetableAvailabilityState,
  _context?: TimetableAvailability['context'],
) {
  return state !== 'operating-unavailable';
}

export function TimetableAvailabilityLegend() {
  return (
    <span className="timetable-availability-legend" aria-label="시간표 이용 가능 상태 범례">
      <span><i className="public-unavailable" aria-hidden="true" />별도 확인 필요</span>
      <span><i className="operating-unavailable" aria-hidden="true" />운영하지 않음</span>
    </span>
  );
}

export function timetableGridStyle(columnCount: number) {
  const safeColumnCount = Math.max(columnCount, 1);

  return {
    gridTemplateColumns: `${TIMETABLE_TIME_COLUMN_WIDTH}px repeat(${safeColumnCount}, minmax(${TIMETABLE_MIN_COLUMN_WIDTH}px, 1fr))`,
    minWidth: `${TIMETABLE_TIME_COLUMN_WIDTH + safeColumnCount * TIMETABLE_MIN_COLUMN_WIDTH}px`,
  };
}

export function clippedBlockPosition(reservation: TimetableReservation, openMinutes: number, closeMinutes: number) {
  const startMinutes = dateTimeToClockMinutes(reservation.startAt);
  const endMinutes = dateTimeToClockMinutes(reservation.endAt);
  const visibleStart = Math.max(startMinutes, openMinutes);
  const visibleEnd = Math.min(endMinutes, closeMinutes);

  return {
    top: (visibleStart - openMinutes) * TIMETABLE_MINUTE_HEIGHT,
    height: (visibleEnd - visibleStart) * TIMETABLE_MINUTE_HEIGHT,
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
  minReservationMinutes = TIMETABLE_GRID_MINUTES,
  availability,
  highlightedReservationId,
  onEmptySlotClick,
  onReservationClick,
  onRoomInfoClick,
  statusLabelOverride,
}: ReservationDateTimetableProps) {
  const navigate = useNavigate();
  const openMinutes = clockToMinutes(openTime || fallbackOpenTime);
  const closeMinutes = Math.max(clockToMinutes(closeTime || fallbackCloseTime), openMinutes + 60);
  const slots = useMemo(
    () => buildSlots(openMinutes, closeMinutes, TIMETABLE_GRID_MINUTES),
    [openMinutes, closeMinutes],
  );
  const emptySlots = slots;
  const suggestedDurationMinutes = defaultSuggestedDurationMinutes(minReservationMinutes);
  const bodyHeight = (closeMinutes - openMinutes) * TIMETABLE_MINUTE_HEIGHT;
  const roomIds = useMemo(() => new Set(rooms.map((room) => room.id)), [rooms]);
  const reservationsByRoom = useMemo(() => {
    const grouped = new Map<string, TimetableReservation[]>();
    reservations
      .filter((reservation) => roomIds.has(reservation.roomId))
      .forEach((reservation) => {
        grouped.set(reservation.roomId, [...(grouped.get(reservation.roomId) || []), reservation]);
      });
    grouped.forEach((items) => items.sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return grouped;
  }, [reservations, roomIds]);

  if (rooms.length === 0) {
    return <div className="state-box empty">표시할 활성 공간이 없습니다.</div>;
  }

  return (
    <div className="timetable-card" data-testid="reservation-date-timetable">
      <div className="timetable-summary" aria-live="polite">
        <strong>{selectedDate}</strong>
        <span className="timetable-summary-details">
          {availability ? <TimetableAvailabilityLegend /> : null}
          {availability ? <span className="timetable-summary-separator" aria-hidden="true">|</span> : null}
          <span>{timetableHoursSummary(openTime, closeTime, availability)}</span>
        </span>
      </div>
      <div className="timetable-scroll" role="region" aria-label={`${selectedDate} 날짜별 예약 시간표`}>
        <div className="timetable-grid" style={timetableGridStyle(rooms.length)}>
          <div className="timetable-corner">시간</div>
          {rooms.map((room) => {
            const canShowRoomInfo = Boolean(onRoomInfoClick && room.description?.trim());

            return (
              <div key={room.id} className="timetable-room-header">
                {canShowRoomInfo ? (
                  <button
                    type="button"
                    className="timetable-room-info-trigger"
                    onClick={() => onRoomInfoClick?.(room)}
                    aria-label={`${room.name} 공간 정보 보기`}
                    data-testid="timetable-room-info-trigger"
                  >
                    <strong>{room.name}</strong>
                    {room.location ? <span>{room.location}</span> : null}
                  </button>
                ) : (
                  <>
                    <strong>{room.name}</strong>
                    {room.location ? <span>{room.location}</span> : null}
                  </>
                )}
              </div>
            );
          })}
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
          {rooms.map((room) => {
            const dayState = timetableDayAvailability(selectedDate, availability);
            return (
            <div
              key={room.id}
              className={`timetable-room-column availability-${dayState}`}
              style={{ height: bodyHeight }}
              aria-label={`${room.name} ${dayState === 'operating-unavailable' ? '운영하지 않음' : dayState === 'public-unavailable' ? '별도 확인 필요' : '일반 예약 가능'}`}
            >
              {emptySlots.slice(0, -1).map((slot) => {
                const endMinutes = slot + suggestedDurationMinutes;
                if (endMinutes > closeMinutes) return null;
                const state = timetableSlotAvailability(selectedDate, slot, endMinutes, availability);
                const selectable = isTimetableSlotSelectable(state, availability?.context);
                const selection = {
                  date: selectedDate,
                  startMinutes: slot,
                  endMinutes,
                  roomId: room.id,
                };
                return selectable ? (
                  <button
                    key={`empty-${slot}`}
                    type="button"
                    className={`timetable-empty-slot availability-${state}`}
                    style={{
                      top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT,
                      height: TIMETABLE_GRID_MINUTES * TIMETABLE_MINUTE_HEIGHT,
                    }}
                    onClick={() => onEmptySlotClick?.(selection)}
                    aria-label={`${room.name} ${formatClock(slot)}-${formatClock(endMinutes)} 예약 신청`}
                    data-testid="timetable-empty-slot"
                  />
                ) : (
                  <div
                    key={`empty-${slot}`}
                    className={`timetable-unavailable-slot availability-${state}`}
                    style={{
                      top: (slot - openMinutes) * TIMETABLE_MINUTE_HEIGHT,
                      height: TIMETABLE_GRID_MINUTES * TIMETABLE_MINUTE_HEIGHT,
                    }}
                    aria-hidden="true"
                    data-testid="timetable-unavailable-slot"
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
                    }}
                    onClick={() =>
                      onReservationClick ? onReservationClick(reservation) : navigate(`/admin/reservations/${reservation.id}`)
                    }
                    aria-label={`${room.name} ${position.startLabel}-${position.endLabel} ${reservation.purpose} ${statusLabelOverride?.[reservation.status] || statusLabels[reservation.status]}`}
                    data-testid="reservation-timetable-block"
                  >
                    <span
                      className="reservation-block-card"
                      style={{
                        borderColor: reservation.seriesColor || undefined,
                        backgroundColor: reservation.seriesColor ? hexToTint(reservation.seriesColor) : undefined,
                      }}
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
                    </span>
                  </button>
                );
              })}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
