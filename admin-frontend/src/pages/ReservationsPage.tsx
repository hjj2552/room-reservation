import { Download, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportReservationsCsv } from '../api/reservations';
import type { ReservationFilters, ReservationStatus } from '../api/types';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { ReservationTable } from '../components/ReservationTable';
import { useReservations } from '../hooks/useReservations';
import { useRooms } from '../hooks/useRooms';
import { toEndOfDayOffset, toStartOfDayOffset } from '../utils/date';
import { statusLabels } from '../utils/labels';

const pageSize = 20;

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function ReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [csvError, setCsvError] = useState('');
  const rooms = useRooms();

  const status = (searchParams.get('status') || '') as '' | ReservationStatus;
  const roomId = searchParams.get('roomId') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
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
  const reservations = useReservations(filters);

  function setParam(name: string, value: string, options: { resetPage?: boolean } = { resetPage: true }) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(name, value);
      else next.delete(name);
      if (options.resetPage !== false) next.set('page', '0');
      return next;
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
      setCsvError(error instanceof Error ? error.message : 'CSV 내보내기에 실패했습니다.');
    }
  }

  return (
    <section className="page-section" aria-labelledby="reservation-list-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">예약 운영</p>
          <h1 id="reservation-list-title">예약 목록</h1>
          <p className="muted">예약을 검색하고 상세 화면에서 승인, 취소, 수정을 처리합니다.</p>
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
          <select value={roomId} onChange={(event) => setParam('roomId', event.target.value)}>
            <option value="">전체</option>
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

      {csvError ? <div className="inline-error" role="alert">{csvError}</div> : null}
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
    </section>
  );
}
