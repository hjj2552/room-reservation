import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminRoom, ReservationFilters, ReservationStatus } from '../../shared/api/types';
import { ReservationDateTimetable } from '../../shared/components/ReservationDateTimetable';
import { ReservationRoomTimetable } from '../../shared/components/ReservationRoomTimetable';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import { TimetablePageHeader, timetableCopy } from '../../shared/components/TimetablePageHeader';
import {
  ReservationRequestPanel,
  duplicateReservationRequestValues,
  initialReservationRequestValues,
  type ReservationRequestValues,
  type TimetableSlotSelection,
} from '../../shared/components/TimetableQuickAddPanel';
import { useCreateReservation, useReservation, useReservations } from '../../shared/hooks/useReservations';
import { useRooms } from '../../shared/hooks/useRooms';
import { useSettings } from '../../shared/hooks/useSettings';
import { fromDateTimeLocal, toEndOfDayOffset, toStartOfDayOffset } from '../../shared/utils/date';

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
  const step = Math.max(slotMinutes || 30, 30);
  const openMinutes = timeValueToMinutes(openTime) ?? 0;
  const closeMinutes = timeValueToMinutes(closeTime) ?? 24 * 60;
  const startMinutes = openMinutes;
  const endMinutes = Math.min(startMinutes + step, closeMinutes);

  return {
    source: 'toolbar',
    roomId: '',
    date,
    startAt: `${date}T${minutesToTimeInput(startMinutes)}`,
    endAt: `${date}T${minutesToTimeInput(endMinutes)}`,
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
  const duplicateQuickAddAppliedRef = useRef<string | null>(null);
  const rooms = useRooms();
  const settings = useSettings();
  const createReservation = useCreateReservation();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(searchParams);
  }, [searchParams]);

  const viewMode = isTimetableViewMode(searchParams.get('view')) ? searchParams.get('view') : 'date';
  const status = (searchParams.get('status') || '') as '' | ReservationStatus;
  const roomId = searchParams.get('roomId') || '';
  const selectedDate = searchParams.get('date') || todayInputValue();
  const selectedWeekStart = startOfWeekInputValue(searchParams.get('weekStart') || todayInputValue());
  const keyword = searchParams.get('keyword') || '';
  const duplicateReservationId = searchParams.get('duplicateReservationId') || '';
  const duplicateReservation = useReservation(duplicateReservationId);

  const dateTimetableFilters = useMemo<ReservationFilters>(
    () => ({
      status,
      roomId,
      keyword,
      excludeCancelled: true,
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
      excludeCancelled: true,
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
  const duplicateQuickAddInitialValues = useMemo(() => {
    if (!duplicateReservationId || !quickAddSelection || !duplicateReservation.data) {
      return undefined;
    }
    return duplicateReservationRequestValues(
      initialReservationRequestValues(quickAddSelection, 'admin'),
      duplicateReservation.data,
    );
  }, [duplicateReservation.data, duplicateReservationId, quickAddSelection]);

  useEffect(() => {
    if (!highlightedReservationId) return;
    const timer = window.setTimeout(() => setHighlightedReservationId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedReservationId]);

  useEffect(() => {
    if (!duplicateReservationId) {
      duplicateQuickAddAppliedRef.current = null;
      return;
    }
    if (duplicateQuickAddAppliedRef.current === duplicateReservationId) {
      return;
    }
    if (!settings.data || !duplicateReservation.data) {
      return;
    }

    setQuickAddSelection(newRequestSelection(settings.data.slotMinutes, settings.data.openTime, settings.data.closeTime));
    duplicateQuickAddAppliedRef.current = duplicateReservationId;
  }, [duplicateReservation.data, duplicateReservationId, settings.data]);

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

  function clearDuplicateReservationParam() {
    updateSearchParams((next) => {
      next.delete('duplicateReservationId');
    });
  }

  function handleEmptySlotClick(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
    clearDuplicateReservationParam();
    setQuickAddSelection(slotToSelection(slot));
  }

  function handleNewRequestClick() {
    clearDuplicateReservationParam();
    setQuickAddSelection(newRequestSelection(settings.data?.slotMinutes, settings.data?.openTime, settings.data?.closeTime));
  }

  function handleQuickAddCreated(reservationId: string) {
    setHighlightedReservationId(reservationId);
    setQuickAddSelection(null);
    clearDuplicateReservationParam();
  }

  function handleQuickAddClose() {
    setQuickAddSelection(null);
    clearDuplicateReservationParam();
  }

  function handleReservationRequest(values: ReservationRequestValues) {
    createReservation.mutate(
      {
        roomId: values.roomId,
        applicantName: values.applicantName,
        applicantEmail: values.applicantEmail,
        applicantPhone: values.applicantPhone,
        purpose: values.purpose,
        startAt: fromDateTimeLocal(values.startAt),
        endAt: fromDateTimeLocal(values.endAt),
        status: values.status,
        memo: values.memo || undefined,
      },
      {
        onSuccess: (created) => handleQuickAddCreated(created.id),
      },
    );
  }

  return (
    <section className="page-section timetable-page" aria-labelledby="timetable-title">
      <TimetablePageHeader
        eyebrow="관리자 메뉴"
        helperText={timetableCopy.adminHelper}
        buttonTestId="timetable-new-request-button"
        onNewRequest={handleNewRequestClick}
      />

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
              <h2 id="date-timetable-title">{timetableCopy.dateTitle}</h2>
              <p className="muted">{timetableCopy.dateDescription}</p>
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
              <h2 id="room-timetable-title">{timetableCopy.roomTitle}</h2>
              <p className="muted">{timetableCopy.roomDescription}</p>
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
        <ReservationRequestPanel
          variant="admin"
          rooms={roomViewRooms}
          selection={quickAddSelection}
          initialValues={duplicateQuickAddInitialValues}
          onClose={handleQuickAddClose}
          onSubmit={handleReservationRequest}
          submitError={createReservation.error}
          isPending={createReservation.isPending}
        />
      ) : null}
    </section>
  );
}
