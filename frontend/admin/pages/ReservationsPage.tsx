import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/http';
import { exportReservationsCsv } from '../../shared/api/reservations';
import type { ReservationFilters, ReservationStatus } from '../../shared/api/types';
import { Pagination } from '../../shared/components/Pagination';
import { ReservationTable } from '../../shared/components/ReservationTable';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useReservations } from '../../shared/hooks/useReservations';
import { useRoomOptions } from '../../shared/hooks/useRooms';
import { statusLabels } from '../../shared/utils/labels';
import { parsePageParam } from '../../shared/utils/page';
import {
  toServiceEndOfDayOffset,
  toServiceStartOfDayOffset,
} from '../../shared/utils/reservationTime';
import { useImeSafeSubmit } from '../hooks/useImeSafeSubmit';

const pageSize = 20;

interface ReservationFilterDraft {
  status: '' | ReservationStatus;
  roomId: string;
  fromDate: string;
  toDate: string;
  keyword: string;
}

function filterDraftFromParams(searchParams: URLSearchParams): ReservationFilterDraft {
  return {
    status: (searchParams.get('status') || '') as '' | ReservationStatus,
    roomId: searchParams.get('roomId') || '',
    fromDate: searchParams.get('fromDate') || '',
    toDate: searchParams.get('toDate') || '',
    keyword: searchParams.get('keyword') || '',
  };
}

function sameFilterDraft(first: ReservationFilterDraft, second: ReservationFilterDraft) {
  return first.status === second.status
    && first.roomId === second.roomId
    && first.fromDate === second.fromDate
    && first.toDate === second.toDate
    && first.keyword === second.keyword;
}

export function ReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const [csvError, setCsvError] = useState('');
  const rooms = useRoomOptions();

  const appliedFilters = useMemo(() => filterDraftFromParams(searchParams), [searchParams]);
  const previousAppliedFiltersRef = useRef(appliedFilters);
  const [draftFilters, setDraftFilters] = useState(appliedFilters);

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(window.location.search);
  }, [searchParams]);

  useEffect(() => {
    const previousAppliedFilters = previousAppliedFiltersRef.current;
    previousAppliedFiltersRef.current = appliedFilters;
    if (!sameFilterDraft(previousAppliedFilters, appliedFilters)) {
      setDraftFilters(appliedFilters);
    }
  }, [appliedFilters]);

  const { status, roomId, fromDate, toDate, keyword } = appliedFilters;
  const pageParam = searchParams.get('page');
  const page = parsePageParam(pageParam);

  const filters = useMemo<ReservationFilters>(
    () => ({
      status,
      roomId,
      keyword,
      from: toServiceStartOfDayOffset(fromDate),
      to: toServiceEndOfDayOffset(toDate),
      page,
      size: pageSize,
    }),
    [status, roomId, keyword, fromDate, toDate, page],
  );
  const reservations = useReservations(filters, { keepPreviousData: true });

  useEffect(() => {
    const invalidPage = pageParam !== null && pageParam !== String(page);
    if (!invalidPage && (
      !reservations.data
      || reservations.isPlaceholderData
      || page < reservations.data.totalPages
    )) return;
    const nextPage = invalidPage ? 0 : Math.max(reservations.data!.totalPages - 1, 0);
    if (!invalidPage && page === nextPage) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    searchParamsRef.current = next;
    setSearchParams(next, { replace: true });
  }, [page, pageParam, reservations.data, reservations.isPlaceholderData, searchParams, setSearchParams]);

  function updateSearchParams(updater: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParamsRef.current);
    updater(next);
    searchParamsRef.current = next;
    setSearchParams(new URLSearchParams(next));
  }

  function setPage(nextPage: number) {
    updateSearchParams((next) => {
      next.set('page', String(nextPage));
    });
  }

  function applyFilters() {
    const normalizedDraft = { ...draftFilters, keyword: draftFilters.keyword.trim() };
    setDraftFilters(normalizedDraft);
    updateSearchParams((next) => {
      for (const [name, value] of Object.entries(normalizedDraft)) {
        if (value) next.set(name, value);
        else next.delete(name);
      }
      next.set('page', '0');
    });
  }

  const filterSubmission = useImeSafeSubmit(applyFilters);

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
          <h1 id="reservation-list-title">예약 목록</h1>
          <p className="muted">예약을 검색하고 상세 화면에서 승인, 취소, 수정을 처리합니다.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={handleCsvDownload}>
            CSV 내보내기
          </button>
        </div>
      </div>

      <form className="filter-bar" onSubmit={filterSubmission.handleSubmit}>
        <label>
          상태
          <select
            data-testid="reservation-status-filter"
            value={draftFilters.status}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              status: event.target.value as '' | ReservationStatus,
            }))}
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
          공간
          <select
            data-testid="reservation-room-filter"
            value={draftFilters.roomId}
            onChange={(event) => setDraftFilters((current) => ({ ...current, roomId: event.target.value }))}
          >
            <option value="">전체</option>
            {rooms.data?.map((room) => (
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
            value={draftFilters.fromDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
          />
        </label>
        <label>
          종료일
          <input
            data-testid="reservation-to-date-filter"
            type="date"
            value={draftFilters.toDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
          />
        </label>
        <label>
          검색어
          <input
            data-testid="reservation-keyword-filter"
            type="search"
            placeholder="신청자, 목적"
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            {...filterSubmission.searchInputProps}
          />
        </label>
        <button type="submit" className="secondary-button" data-testid="reservation-search-button">
          조회
        </button>
      </form>

      {csvError ? (
        <div className="inline-error" role="alert">
          {csvError}
        </div>
      ) : null}
      <div className="reservation-list-results" data-testid="reservation-list-results" aria-busy={reservations.isFetching}>
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
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
