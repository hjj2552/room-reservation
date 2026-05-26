import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminRoom, ReservationFilters, ReservationStatus } from '../api/types';
import { ReservationDateTimetable } from '../components/ReservationDateTimetable';
import { ReservationRoomTimetable } from '../components/ReservationRoomTimetable';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { TimetableQuickAddPanel, type TimetableSlotSelection } from '../components/TimetableQuickAddPanel';
import { useReservations } from '../hooks/useReservations';
import { useRooms } from '../hooks/useRooms';
import { useSettings } from '../hooks/useSettings';
import { toEndOfDayOffset, toStartOfDayOffset } from '../utils/date';

const timetablePageSize = 500;
const timetableViewModes = ['date', 'room'] as const;

type TimetableViewMode = (typeof timetableViewModes)[number];

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isDateInputValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function slotToSelection(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
  return {
    roomId: slot.roomId,
    date: slot.date,
    startAt: `${slot.date}T${minutesToTimeInput(slot.startMinutes)}`,
    endAt: `${slot.date}T${minutesToTimeInput(slot.endMinutes)}`,
  };
}

function startOfWeekInputValue(value: string) {
  const base = isDateInputValue(value) ? value : todayInputValue();
  const date = new Date(`${base}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function isTimetableViewMode(value: string | null): value is TimetableViewMode {
  return timetableViewModes.includes(value as TimetableViewMode);
}

function ViewModeIcon({ mode }: { mode: TimetableViewMode }) {
  if (mode === 'room') return <DoorOpen size={16} aria-hidden="true" />;
  return <CalendarDays size={16} aria-hidden="true" />;
}

function enabledActiveRooms(rooms: AdminRoom[] = []) {
  return rooms.filter((room) => room.enabled && !room.deleted);
}

function activeRooms(rooms: AdminRoom[] = [], selectedRoomId: string) {
  const active = enabledActiveRooms(rooms);
  return selectedRoomId ? active.filter((room) => room.id === selectedRoomId) : active;
}

export function TimetablePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const [quickAddSelection, setQuickAddSelection] = useState<TimetableSlotSelection | null>(null);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);
  const rooms = useRooms();
  const settings = useSettings();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(searchParams);
  }, [searchParams]);

  const viewMode = isTimetableViewMode(searchParams.get('view')) ? searchParams.get('view') : 'date';
  const status = (searchParams.get('status') || '') as '' | ReservationStatus;
  const roomId = searchParams.get('roomId') || '';
  const selectedDate = searchParams.get('date') || todayInputValue();
  const selectedWeekStart = startOfWeekInputValue(searchParams.get('weekStart') || todayInputValue());
  const keyword = searchParams.get('keyword') || '';

  const dateTimetableFilters = useMemo<ReservationFilters>(
    () => ({
      status,
      roomId,
      keyword,
      from: toStartOfDayOffset(selectedDate),
      to: toEndOfDayOffset(selectedDate),
      page: 0,
      size: timetablePageSize,
    }),
    [status, roomId, keyword, selectedDate],
  );
  const dateTimetableReservations = useReservations(dateTimetableFilters, { enabled: viewMode === 'date' });
  const dateTimetableRooms = useMemo(() => activeRooms(rooms.data?.items, roomId), [rooms.data?.items, roomId]);

  const roomViewRooms = useMemo(() => enabledActiveRooms(rooms.data?.items), [rooms.data?.items]);
  const roomViewRoomIdParam = searchParams.get('roomViewRoomId') || '';
  const selectedRoomViewRoomId = roomViewRooms.some((room) => room.id === roomViewRoomIdParam)
    ? roomViewRoomIdParam
    : roomViewRooms[0]?.id || '';
  const selectedRoomViewRoom = roomViewRooms.find((room) => room.id === selectedRoomViewRoomId);
  const roomTimetableFilters = useMemo<ReservationFilters>(
    () => ({
      status,
      roomId: selectedRoomViewRoomId,
      keyword,
      from: toStartOfDayOffset(selectedWeekStart),
      to: toEndOfDayOffset(addDaysInputValue(selectedWeekStart, 6)),
      page: 0,
      size: timetablePageSize,
    }),
    [status, selectedRoomViewRoomId, keyword, selectedWeekStart],
  );
  const roomTimetableReservations = useReservations(roomTimetableFilters, {
    enabled: viewMode === 'room' && Boolean(selectedRoomViewRoomId),
  });

  useEffect(() => {
    if (!highlightedReservationId) return;
    const timer = window.setTimeout(() => setHighlightedReservationId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedReservationId]);

  function updateSearchParams(updater: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParamsRef.current);
    updater(next);
    searchParamsRef.current = next;
    setSearchParams(new URLSearchParams(next));
  }

  function setParam(name: string, value: string) {
    updateSearchParams((next) => {
      if (value) next.set(name, value);
      else next.delete(name);
    });
  }

  function setViewMode(nextMode: TimetableViewMode) {
    updateSearchParams((next) => {
      next.set('view', nextMode);
      if (nextMode === 'room') {
        if (!next.get('weekStart')) next.set('weekStart', selectedWeekStart);
        if (!next.get('roomViewRoomId') && roomViewRooms[0]) next.set('roomViewRoomId', roomViewRooms[0].id);
      }
    });
  }

  function setRoomViewRoomId(nextRoomId: string) {
    updateSearchParams((next) => {
      next.set('view', 'room');
      if (nextRoomId) next.set('roomViewRoomId', nextRoomId);
      else next.delete('roomViewRoomId');
    });
  }

  function setWeekStart(nextDate: string) {
    updateSearchParams((next) => {
      next.set('view', 'room');
      next.set('weekStart', startOfWeekInputValue(nextDate));
    });
  }

  function handleEmptySlotClick(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
    setQuickAddSelection(slotToSelection(slot));
  }

  function handleQuickAddCreated(reservationId: string) {
    setHighlightedReservationId(reservationId);
    setQuickAddSelection(null);
  }

  return (
    <section className="page-section" aria-labelledby="timetable-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">운영 현황</p>
          <h1 id="timetable-title">시간표</h1>
          <p className="muted">강의실 점유 현황과 빈 시간을 날짜별 또는 강의실별로 확인합니다.</p>
        </div>
      </div>

      <div className="view-mode-bar" role="tablist" aria-label="시간표 보기 방식">
        {timetableViewModes.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={viewMode === mode}
            className={viewMode === mode ? 'view-mode-tab active' : 'view-mode-tab'}
            onClick={() => setViewMode(mode)}
            data-testid={`timetable-view-${mode}`}
          >
            <ViewModeIcon mode={mode} />
            {mode === 'date' ? '날짜별' : '강의실별'}
          </button>
        ))}
      </div>

      {viewMode === 'date' ? (
        <section className="panel timetable-panel" aria-labelledby="date-timetable-title">
          <div className="panel-header">
            <div>
              <h2 id="date-timetable-title">날짜별 예약 시간표</h2>
              <p className="muted">선택한 날짜의 활성 강의실 점유 현황을 시간순으로 확인합니다.</p>
            </div>
            <div className="room-week-controls">
              <label className="compact-room-picker">
                강의실
                <select
                  value={roomId}
                  onChange={(event) => setParam('roomId', event.target.value)}
                  data-testid="timetable-date-room-select"
                >
                  <option value="">전체</option>
                  {rooms.data?.items.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-date-picker">
                날짜
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setParam('date', event.target.value)}
                  data-testid="timetable-date-input"
                />
              </label>
            </div>
          </div>

          {rooms.isLoading || settings.isLoading || dateTimetableReservations.isLoading ? <LoadingState /> : null}
          {rooms.isError ? <ErrorState error={rooms.error} /> : null}
          {settings.isError ? <ErrorState error={settings.error} /> : null}
          {dateTimetableReservations.isError ? <ErrorState error={dateTimetableReservations.error} /> : null}
          {rooms.data && settings.data && dateTimetableReservations.data ? (
            <ReservationDateTimetable
              rooms={dateTimetableRooms}
              reservations={dateTimetableReservations.data.items}
              selectedDate={selectedDate}
              openTime={settings.data.openTime}
              closeTime={settings.data.closeTime}
              slotMinutes={settings.data.slotMinutes}
              highlightedReservationId={highlightedReservationId}
              onEmptySlotClick={handleEmptySlotClick}
            />
          ) : null}
          {dateTimetableReservations.data && dateTimetableReservations.data.totalPages > 1 ? (
            <p className="compact-note muted">
              이 날짜의 예약이 많아 일부만 표시될 수 있습니다. 강의실을 선택해 범위를 좁혀 확인하세요.
            </p>
          ) : null}
        </section>
      ) : null}

      {viewMode === 'room' ? (
        <section className="panel timetable-panel" aria-labelledby="room-timetable-title">
          <div className="panel-header">
            <div>
              <h2 id="room-timetable-title">강의실별 주간 시간표</h2>
              <p className="muted">선택한 강의실의 월요일부터 일요일까지 예약 흐름을 확인합니다.</p>
            </div>
            <div className="room-week-controls">
              <label className="compact-room-picker">
                강의실
                <select
                  value={selectedRoomViewRoomId}
                  onChange={(event) => setRoomViewRoomId(event.target.value)}
                  data-testid="timetable-room-select"
                >
                  {roomViewRooms.map((room) => (
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
                  onClick={() => setWeekStart(addDaysInputValue(selectedWeekStart, -7))}
                  aria-label="이전 주"
                  data-testid="timetable-prev-week"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <label className="compact-date-picker">
                  주 시작일
                  <input
                    type="date"
                    value={selectedWeekStart}
                    onChange={(event) => setWeekStart(event.target.value)}
                    data-testid="timetable-week-input"
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button icon-button"
                  onClick={() => setWeekStart(addDaysInputValue(selectedWeekStart, 7))}
                  aria-label="다음 주"
                  data-testid="timetable-next-week"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {rooms.isLoading || settings.isLoading || roomTimetableReservations.isLoading ? <LoadingState /> : null}
          {rooms.isError ? <ErrorState error={rooms.error} /> : null}
          {settings.isError ? <ErrorState error={settings.error} /> : null}
          {roomTimetableReservations.isError ? <ErrorState error={roomTimetableReservations.error} /> : null}
          {rooms.data && roomViewRooms.length === 0 ? <EmptyState message="표시할 활성 강의실이 없습니다." /> : null}
          {settings.data && selectedRoomViewRoom && roomTimetableReservations.data ? (
            <ReservationRoomTimetable
              room={selectedRoomViewRoom}
              reservations={roomTimetableReservations.data.items}
              weekStart={selectedWeekStart}
              openTime={settings.data.openTime}
              closeTime={settings.data.closeTime}
              slotMinutes={settings.data.slotMinutes}
              highlightedReservationId={highlightedReservationId}
              onEmptySlotClick={handleEmptySlotClick}
            />
          ) : null}
          {roomTimetableReservations.data && roomTimetableReservations.data.totalPages > 1 ? (
            <p className="compact-note muted">
              이 주의 예약이 많아 일부만 표시될 수 있습니다. 강의실 또는 주를 조정해 확인하세요.
            </p>
          ) : null}
        </section>
      ) : null}
      {quickAddSelection ? (
        <TimetableQuickAddPanel
          rooms={roomViewRooms}
          selection={quickAddSelection}
          onClose={() => setQuickAddSelection(null)}
          onCreated={handleQuickAddCreated}
        />
      ) : null}
    </section>
  );
}
