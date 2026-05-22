import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Download, List, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/http';
import { exportReservationsCsv } from '../api/reservations';
import type { AdminRoom, ReservationFilters, ReservationStatus } from '../api/types';
import { Pagination } from '../components/Pagination';
import { ReservationDateTimetable } from '../components/ReservationDateTimetable';
import { ReservationRoomTimetable } from '../components/ReservationRoomTimetable';
import { ReservationTable } from '../components/ReservationTable';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useReservations } from '../hooks/useReservations';
import { useRooms } from '../hooks/useRooms';
import { useSettings } from '../hooks/useSettings';
import { toEndOfDayOffset, toStartOfDayOffset } from '../utils/date';
import { statusLabels } from '../utils/labels';

const pageSize = 20;
const timetablePageSize = 500;
const viewModes = ['list', 'date', 'room'] as const;

type ReservationViewMode = (typeof viewModes)[number];

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

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

function startOfWeekInputValue(value: string) {
  const base = isDateInputValue(value) ? value : todayInputValue();
  const date = new Date(`${base}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function isReservationViewMode(value: string | null): value is ReservationViewMode {
  return viewModes.includes(value as ReservationViewMode);
}

function ViewModeIcon({ mode }: { mode: ReservationViewMode }) {
  if (mode === 'date') return <CalendarDays size={16} aria-hidden="true" />;
  if (mode === 'room') return <DoorOpen size={16} aria-hidden="true" />;
  return <List size={16} aria-hidden="true" />;
}

function enabledActiveRooms(rooms: AdminRoom[] = []) {
  return rooms.filter((room) => room.enabled && !room.deleted);
}

function activeRooms(rooms: AdminRoom[] = [], selectedRoomId: string) {
  const active = enabledActiveRooms(rooms);
  return selectedRoomId ? active.filter((room) => room.id === selectedRoomId) : active;
}

export function ReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const [csvError, setCsvError] = useState('');
  const rooms = useRooms();
  const settings = useSettings();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(searchParams);
  }, [searchParams]);

  const viewMode = isReservationViewMode(searchParams.get('view')) ? searchParams.get('view') : 'list';
  const status = (searchParams.get('status') || '') as '' | ReservationStatus;
  const roomId = searchParams.get('roomId') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const selectedDate = searchParams.get('date') || todayInputValue();
  const selectedWeekStart = startOfWeekInputValue(searchParams.get('weekStart') || todayInputValue());
  const keyword = searchParams.get('keyword') || '';
  const page = numberParam(searchParams.get('page'), 0);

  const filters = useMemo<ReservationFilters>(
    () => ({
      status,
      roomId,
      keyword,
      from: toStartOfDayOffset(fromDate),
      to: toEndOfDayOffset(toDate),
      page,
      size: pageSize,
    }),
    [status, roomId, keyword, fromDate, toDate, page],
  );
  const reservations = useReservations(filters, { enabled: viewMode === 'list' });

  const timetableFilters = useMemo<ReservationFilters>(
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
  const timetableReservations = useReservations(timetableFilters, { enabled: viewMode === 'date' });
  const timetableRooms = useMemo(() => activeRooms(rooms.data?.items, roomId), [rooms.data?.items, roomId]);
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

  function updateSearchParams(updater: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParamsRef.current);
    updater(next);
    searchParamsRef.current = next;
    setSearchParams(new URLSearchParams(next));
  }

  function setParam(name: string, value: string, options: { resetPage?: boolean } = { resetPage: true }) {
    updateSearchParams((next) => {
      if (value) next.set(name, value);
      else next.delete(name);
      if (options.resetPage !== false) next.set('page', '0');
    });
  }

  function setViewMode(nextMode: ReservationViewMode) {
    updateSearchParams((next) => {
      next.set('view', nextMode);
      next.set('page', '0');
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
      next.set('page', '0');
    });
  }

  function setWeekStart(nextDate: string) {
    updateSearchParams((next) => {
      next.set('view', 'room');
      next.set('weekStart', startOfWeekInputValue(nextDate));
      next.set('page', '0');
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParam('page', '0', { resetPage: false });
  }

  async function handleCsvDownload() {
    setCsvError('');
    try {
      await exportReservationsCsv(filters);
    } catch (error) {
      setCsvError(errorMessage(error));
    }
  }

  return (
    <section className="page-section" aria-labelledby="reservation-list-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">예약 운영</p>
          <h1 id="reservation-list-title">예약 목록</h1>
          <p className="muted">목록과 시간표를 전환하며 강의실 예약 흐름을 확인합니다.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={handleCsvDownload}>
            <Download size={16} aria-hidden="true" />
            CSV 내보내기
          </button>
          <Link className="primary-button" to="/reservations/new">
            예약 등록
          </Link>
        </div>
      </div>

      <div className="view-mode-bar" role="tablist" aria-label="예약 보기 방식">
        {viewModes.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={viewMode === mode}
            className={viewMode === mode ? 'view-mode-tab active' : 'view-mode-tab'}
            onClick={() => setViewMode(mode)}
            data-testid={`reservation-view-${mode}`}
          >
            <ViewModeIcon mode={mode} />
            {mode === 'list' ? '목록' : mode === 'date' ? '날짜별' : '강의실별'}
          </button>
        ))}
      </div>

      <form className="filter-bar" onSubmit={handleSubmit}>
        <label>
          상태
          <select
            data-testid="reservation-status-filter"
            value={status}
            onChange={(event) => setParam('status', event.target.value)}
          >
            <option value="">전체</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          강의실
          <select
            value={viewMode === 'room' ? selectedRoomViewRoomId : roomId}
            onChange={(event) =>
              viewMode === 'room' ? setRoomViewRoomId(event.target.value) : setParam('roomId', event.target.value)
            }
          >
            <option value="">{viewMode === 'room' ? '선택' : '전체'}</option>
            {rooms.data?.items.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          시작일
          <input
            data-testid="reservation-from-date-filter"
            type="date"
            value={fromDate}
            onChange={(event) => setParam('fromDate', event.target.value)}
          />
        </label>
        <label>
          종료일
          <input type="date" value={toDate} onChange={(event) => setParam('toDate', event.target.value)} />
        </label>
        <label>
          검색어
          <input
            data-testid="reservation-keyword-filter"
            type="search"
            placeholder="신청자, 목적"
            value={keyword}
            onChange={(event) => setParam('keyword', event.target.value)}
          />
        </label>
        <button type="submit" className="secondary-button" data-testid="reservation-search-button">
          <Search size={16} aria-hidden="true" />
          조회
        </button>
      </form>

      {csvError ? (
        <div className="inline-error" role="alert">
          {csvError}
        </div>
      ) : null}

      {viewMode === 'list' ? (
        <>
          {reservations.isLoading ? <LoadingState /> : null}
          {reservations.isError ? <ErrorState error={reservations.error} /> : null}
          {reservations.data && reservations.data.items.length === 0 ? (
            <EmptyState message="조건에 맞는 예약이 없습니다." />
          ) : null}
          {reservations.data && reservations.data.items.length > 0 ? (
            <>
              <ReservationTable reservations={reservations.data.items} />
              <Pagination
                page={reservations.data.page}
                totalPages={reservations.data.totalPages}
                totalItems={reservations.data.totalItems}
                size={reservations.data.size}
                onPageChange={(nextPage) => setParam('page', String(nextPage), { resetPage: false })}
              />
            </>
          ) : null}
        </>
      ) : null}

      {viewMode === 'date' ? (
        <section className="panel timetable-panel" aria-labelledby="date-timetable-title">
          <div className="panel-header">
            <div>
              <h2 id="date-timetable-title">날짜별 예약 시간표</h2>
              <p className="muted">선택한 날짜의 활성 강의실 점유 현황을 시간순으로 확인합니다.</p>
            </div>
            <label className="compact-date-picker">
              날짜
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setParam('date', event.target.value, { resetPage: false })}
                data-testid="reservation-date-view-date-input"
              />
            </label>
          </div>

          {rooms.isLoading || settings.isLoading || timetableReservations.isLoading ? <LoadingState /> : null}
          {rooms.isError ? <ErrorState error={rooms.error} /> : null}
          {settings.isError ? <ErrorState error={settings.error} /> : null}
          {timetableReservations.isError ? <ErrorState error={timetableReservations.error} /> : null}
          {rooms.data && settings.data && timetableReservations.data ? (
            <ReservationDateTimetable
              rooms={timetableRooms}
              reservations={timetableReservations.data.items}
              selectedDate={selectedDate}
              openTime={settings.data.openTime}
              closeTime={settings.data.closeTime}
              slotMinutes={settings.data.slotMinutes}
            />
          ) : null}
          {timetableReservations.data && timetableReservations.data.totalPages > 1 ? (
            <p className="compact-note muted">
              이 날짜의 예약이 많아 일부만 표시될 수 있습니다. 검색어나 강의실 필터로 범위를 좁혀 확인하세요.
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
                  data-testid="reservation-room-view-room-select"
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
                  data-testid="reservation-room-view-prev-week"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <label className="compact-date-picker">
                  주 시작일
                  <input
                    type="date"
                    value={selectedWeekStart}
                    onChange={(event) => setWeekStart(event.target.value)}
                    data-testid="reservation-room-view-week-input"
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button icon-button"
                  onClick={() => setWeekStart(addDaysInputValue(selectedWeekStart, 7))}
                  aria-label="다음 주"
                  data-testid="reservation-room-view-next-week"
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
            />
          ) : null}
          {roomTimetableReservations.data && roomTimetableReservations.data.totalPages > 1 ? (
            <p className="compact-note muted">
              이 주의 예약이 많아 일부만 표시될 수 있습니다. 검색어 또는 상태 필터로 범위를 좁혀 확인하세요.
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
