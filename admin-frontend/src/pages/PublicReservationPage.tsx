import { useQueries } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicWeeklyReservations } from '../api/public';
import type { PublicReservationBlock } from '../api/types';
import { ReservationDateTimetable, type TimetableReservation } from '../components/ReservationDateTimetable';
import { ReservationRoomTimetable } from '../components/ReservationRoomTimetable';
import {
  ReservationRequestPanel,
  type ReservationRequestValues,
  type TimetableSlotSelection,
} from '../components/TimetableQuickAddPanel';
import { TimetablePageHeader, timetableCopy } from '../components/TimetablePageHeader';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  publicReservationKeys,
  useCreatePublicReservation,
  usePublicRooms,
  usePublicSettings,
  usePublicWeeklyReservations,
} from '../hooks/usePublicReservation';
import { fromDateTimeLocal } from '../utils/date';

type PublicTimetableViewMode = 'date' | 'room';

const timetablePageSizeNote = '표시된 신청/예약은 대기 또는 승인 상태입니다.';
const publicStatusLabels = {
  REQUESTED: '신청 대기',
  CONFIRMED: '예약 승인',
  CANCELLED: '취소됨',
};

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysInputValue(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekInputValue(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
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

function slotToSelection(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
  return {
    source: 'slot' as const,
    roomId: slot.roomId,
    date: slot.date,
    startAt: `${slot.date}T${minutesToTimeInput(slot.startMinutes)}`,
    endAt: `${slot.date}T${minutesToTimeInput(slot.endMinutes)}`,
  };
}

function newRequestSelection(slotMinutes = 30, openTime?: string, closeTime?: string): TimetableSlotSelection {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const date = local.toISOString().slice(0, 10);
  const currentMinutes = local.getHours() * 60 + local.getMinutes();
  const step = Math.max(slotMinutes || 30, 30);
  const openMinutes = timeValueToMinutes(openTime) ?? 0;
  const closeMinutes = timeValueToMinutes(closeTime) ?? 24 * 60;
  const latestStartMinutes = Math.max(openMinutes, closeMinutes - step);
  const roundedStartMinutes = Math.ceil(currentMinutes / step) * step;
  const startMinutes = Math.min(Math.max(roundedStartMinutes, openMinutes), latestStartMinutes);
  const endMinutes = Math.min(startMinutes + step, closeMinutes);

  return {
    source: 'toolbar',
    roomId: '',
    date,
    startAt: `${date}T${minutesToTimeInput(startMinutes)}`,
    endAt: `${date}T${minutesToTimeInput(endMinutes)}`,
  };
}

function dateInKst(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function toTimetableReservation(reservation: PublicReservationBlock): TimetableReservation {
  return {
    id: reservation.id,
    roomId: reservation.roomId,
    roomName: reservation.roomName,
    applicantName: reservation.applicantName,
    purpose: reservation.purpose,
    startAt: reservation.startAt,
    endAt: reservation.endAt,
    status: reservation.status,
  };
}

export function PublicReservationPage() {
  const navigate = useNavigate();
  const rooms = usePublicRooms();
  const settings = usePublicSettings();
  const create = useCreatePublicReservation();
  const [viewMode, setViewMode] = useState<PublicTimetableViewMode>('date');
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [quickSelection, setQuickSelection] = useState<TimetableSlotSelection | null>(null);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);

  const activeRooms = rooms.data || [];
  const roomViewRoomId = activeRooms.some((room) => room.id === selectedRoomId)
    ? selectedRoomId
    : activeRooms[0]?.id || '';
  const selectedRoom = activeRooms.find((room) => room.id === roomViewRoomId);
  const selectedWeekStart = startOfWeekInputValue(selectedDate);
  const roomWeekly = usePublicWeeklyReservations(roomViewRoomId, selectedWeekStart);
  const dateWeeklyQueries = useQueries({
    queries: activeRooms.map((room) => ({
      queryKey: publicReservationKeys.weekly(room.id, selectedWeekStart),
      queryFn: () => getPublicWeeklyReservations(room.id, selectedWeekStart),
      enabled: viewMode === 'date',
    })),
  });

  useEffect(() => {
    if (!selectedRoomId && activeRooms[0]) setSelectedRoomId(activeRooms[0].id);
  }, [activeRooms, selectedRoomId]);

  useEffect(() => {
    if (!highlightedReservationId) return;
    const timer = window.setTimeout(() => setHighlightedReservationId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedReservationId]);

  const dateReservations = useMemo(
    () =>
      dateWeeklyQueries
        .flatMap((query) => query.data?.reservations || [])
        .filter((reservation) => dateInKst(reservation.startAt) === selectedDate)
        .map(toTimetableReservation),
    [dateWeeklyQueries, selectedDate],
  );
  const roomReservations = useMemo(
    () => (roomWeekly.data?.reservations || []).map(toTimetableReservation),
    [roomWeekly.data],
  );

  const isUnavailable = settings.data && !settings.data.reservationEnabled;
  const dateIsLoading = viewMode === 'date' && dateWeeklyQueries.some((query) => query.isLoading);
  const dateError = viewMode === 'date' ? dateWeeklyQueries.find((query) => query.isError)?.error : null;

  function handleSlotClick(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
    if (isUnavailable) return;
    setQuickSelection(slotToSelection(slot));
  }

  function handleNewRequestClick() {
    if (isUnavailable) return;
    setQuickSelection(newRequestSelection(settings.data?.slotMinutes, settings.data?.openTime, settings.data?.closeTime));
  }

  function handleReservationClick(reservation: TimetableReservation) {
    navigate(`/public/reservations/${reservation.id}`);
  }

  function handlePublicRequest(values: ReservationRequestValues) {
    create.mutate(
      {
        roomId: values.roomId,
        applicantName: values.applicantName,
        applicantEmail: values.applicantEmail,
        applicantPhone: values.applicantPhone || undefined,
        purpose: values.purpose,
        startAt: fromDateTimeLocal(values.startAt),
        endAt: fromDateTimeLocal(values.endAt),
        cancelPassword: values.cancelPassword,
      },
      {
        onSuccess: (created) => {
          setHighlightedReservationId(created.id);
          setQuickSelection(null);
        },
      },
    );
  }

  return (
    <div className="public-shell" aria-labelledby="timetable-title">
      <TimetablePageHeader
        eyebrow={settings.data?.organizationName || '강의실 예약'}
        helperText="신청은 대기 상태로 접수되며 운영자 승인 후 예약됩니다."
        buttonTestId="public-new-request-button"
        buttonDisabled={Boolean(isUnavailable)}
        onNewRequest={handleNewRequestClick}
      />

      {rooms.isLoading || settings.isLoading ? <LoadingState /> : null}
      {rooms.isError ? <ErrorState error={rooms.error} /> : null}
      {settings.isError ? <ErrorState error={settings.error} /> : null}

      {settings.data ? (
        <section className="public-notice" aria-live="polite">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            {settings.data.publicNotice ? <strong className="public-notice-message">{settings.data.publicNotice}</strong> : null}
            <strong>
              신청 가능 시간 {String(settings.data.openTime).slice(0, 5)}-
              {String(settings.data.closeTime).slice(0, 5)}
            </strong>
            <p>{timetablePageSizeNote}</p>
          </div>
        </section>
      ) : null}

      {isUnavailable ? (
        <div className="inline-error" role="alert">
          {settings.data?.reservationDisabledMessage || '현재 예약 신청 접수가 중지되어 있습니다.'}
        </div>
      ) : null}

      {rooms.data && settings.data ? (
        <div className="view-mode-bar" role="tablist" aria-label="시간표 보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'date'}
            className={viewMode === 'date' ? 'view-mode-tab active' : 'view-mode-tab'}
            onClick={() => setViewMode('date')}
            data-testid="public-timetable-view-date"
          >
            <CalendarDays size={16} aria-hidden="true" />
            날짜별
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'room'}
            className={viewMode === 'room' ? 'view-mode-tab active' : 'view-mode-tab'}
            onClick={() => setViewMode('room')}
            data-testid="public-timetable-view-room"
          >
            <DoorOpen size={16} aria-hidden="true" />
            강의실별
          </button>
        </div>
      ) : null}

      {rooms.data && settings.data ? (
        <section className="panel timetable-panel" aria-labelledby="public-timetable-title">
          <div className="panel-header">
            <div>
              <h2 id="public-timetable-title">
                {viewMode === 'date' ? timetableCopy.dateTitle : timetableCopy.roomTitle}
              </h2>
              <p className="muted">
                {viewMode === 'date' ? timetableCopy.dateDescription : timetableCopy.roomDescription}
              </p>
            </div>
          </div>

          {viewMode === 'date' ? (
            <>
              <div className="room-week-controls">
                <label className="compact-date-picker">
                  날짜
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    data-testid="public-timetable-date-input"
                  />
                </label>
              </div>
              {dateIsLoading ? <LoadingState /> : null}
              {dateError ? <ErrorState error={dateError} /> : null}
              <ReservationDateTimetable
                rooms={activeRooms}
                reservations={dateReservations}
                selectedDate={selectedDate}
                openTime={settings.data.openTime}
                closeTime={settings.data.closeTime}
                slotMinutes={settings.data.slotMinutes}
                highlightedReservationId={highlightedReservationId}
                onEmptySlotClick={handleSlotClick}
                onReservationClick={handleReservationClick}
                statusLabelOverride={publicStatusLabels}
              />
            </>
          ) : null}

          {viewMode === 'room' ? (
            <>
              <div className="room-week-controls">
                <label className="compact-room-picker">
                  강의실
                  <select
                    value={roomViewRoomId}
                    onChange={(event) => setSelectedRoomId(event.target.value)}
                    data-testid="public-timetable-room-select"
                  >
                    {activeRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="week-navigation">
                  <button
                    type="button"
                    className="secondary-button icon-button"
                    onClick={() => setSelectedDate(addDaysInputValue(selectedWeekStart, -7))}
                    aria-label="이전 주"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <label className="compact-date-picker">
                    주 시작일
                    <input
                      type="date"
                      value={selectedWeekStart}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      data-testid="public-timetable-week-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button icon-button"
                    onClick={() => setSelectedDate(addDaysInputValue(selectedWeekStart, 7))}
                    aria-label="다음 주"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {roomWeekly.isLoading ? <LoadingState /> : null}
              {roomWeekly.isError ? <ErrorState error={roomWeekly.error} /> : null}
              <ReservationRoomTimetable
                room={selectedRoom}
                reservations={roomReservations}
                weekStart={selectedWeekStart}
                openTime={settings.data.openTime}
                closeTime={settings.data.closeTime}
                slotMinutes={settings.data.slotMinutes}
                highlightedReservationId={highlightedReservationId}
                onEmptySlotClick={handleSlotClick}
                onReservationClick={handleReservationClick}
                statusLabelOverride={publicStatusLabels}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {quickSelection ? (
        <ReservationRequestPanel
          variant="public"
          rooms={activeRooms}
          selection={quickSelection}
          requirePhone={Boolean(settings.data?.requirePhone)}
          onClose={() => setQuickSelection(null)}
          onSubmit={handlePublicRequest}
          submitError={create.error}
          isPending={create.isPending}
        />
      ) : null}

    </div>
  );
}
