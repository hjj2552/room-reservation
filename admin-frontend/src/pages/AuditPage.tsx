import { FormEvent, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useReservationHistoryAudit } from '../hooks/useAudit';
import { useRooms } from '../hooks/useRooms';
import { formatDateTime, toEndOfDayOffset, toStartOfDayOffset } from '../utils/date';
import { historyActionLabel, statusLabels } from '../utils/labels';

const pageSize = 20;

const actions = [
  'CREATED_BY_ADMIN',
  'CREATED',
  'RECURRENCE_GENERATED',
  'UPDATED',
  'APPROVED',
  'CANCELLED',
  'RECURRENCE_CANCELLED',
];

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const rooms = useRooms();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(window.location.search);
  }, [searchParams]);

  const reservationId = searchParams.get('reservationId') || '';
  const roomId = searchParams.get('roomId') || '';
  const action = searchParams.get('action') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const page = numberParam(searchParams.get('page'), 0);

  const filters = useMemo(
    () => ({
      reservationId,
      roomId,
      action,
      from: toStartOfDayOffset(fromDate),
      to: toEndOfDayOffset(toDate),
      page,
      size: pageSize,
    }),
    [reservationId, roomId, action, fromDate, toDate, page],
  );
  const audit = useReservationHistoryAudit(filters);

  function setParam(name: string, value: string, options: { resetPage?: boolean } = { resetPage: true }) {
    const next = new URLSearchParams(searchParamsRef.current);
    if (value) next.set(name, value);
    else next.delete(name);
    if (options.resetPage !== false) next.set('page', '0');
    searchParamsRef.current = next;
    setSearchParams(new URLSearchParams(next));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParam('page', '0', { resetPage: false });
  }

  return (
    <section className="page-section" aria-labelledby="audit-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">감사 이력</p>
          <h1 id="audit-title">예약 감사 이력</h1>
          <p className="muted">예약 신청, 수정, 승인, 취소 이력을 조건별로 조회합니다.</p>
        </div>
      </div>

      <form className="filter-bar audit-filter" onSubmit={handleSubmit}>
        <label>
          예약 ID
          <input
            data-testid="audit-reservation-id-input"
            value={reservationId}
            placeholder="특정 예약 ID"
            onChange={(event) => setParam('reservationId', event.target.value)}
          />
        </label>
        <label>
          강의실
          <select
            data-testid="audit-room-select"
            value={roomId}
            onChange={(event) => setParam('roomId', event.target.value)}
          >
            <option value="">전체</option>
            {rooms.data?.items.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          처리 유형
          <select
            data-testid="audit-action-select"
            value={action}
            onChange={(event) => setParam('action', event.target.value)}
          >
            <option value="">전체</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {historyActionLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          시작일
          <input type="date" value={fromDate} onChange={(event) => setParam('fromDate', event.target.value)} />
        </label>
        <label>
          종료일
          <input type="date" value={toDate} onChange={(event) => setParam('toDate', event.target.value)} />
        </label>
        <button type="submit" className="secondary-button" data-testid="audit-search-button">조회</button>
      </form>

      {audit.isLoading ? <LoadingState /> : null}
      {audit.isError ? <ErrorState error={audit.error} /> : null}
      {audit.data && audit.data.items.length === 0 ? <EmptyState message="조건에 맞는 이력이 없습니다." /> : null}
      {audit.data && audit.data.items.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table" data-testid="audit-table">
              <caption className="sr-only">예약 감사 이력</caption>
              <thead>
                <tr>
                  <th scope="col">처리 시각</th>
                  <th scope="col">처리 유형</th>
                  <th scope="col">상태 변경</th>
                  <th scope="col">처리자</th>
                  <th scope="col">예약</th>
                  <th scope="col">메모</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((history) => (
                  <tr key={history.id}>
                    <td>{formatDateTime(history.createdAt)}</td>
                    <td>{historyActionLabel(history.action)}</td>
                    <td>
                      {history.beforeStatus ? statusLabels[history.beforeStatus] : '-'} →{' '}
                      {history.afterStatus ? statusLabels[history.afterStatus] : '-'}
                    </td>
                    <td>
                      {history.actorId}
                      <br />
                      <span className="muted">{history.actorType}</span>
                    </td>
                    <td>
                      <Link className="text-link" to={`/reservations/${history.reservationId}`}>
                        상세 보기
                      </Link>
                    </td>
                    <td>{history.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={audit.data.page}
            totalPages={audit.data.totalPages}
            totalItems={audit.data.totalItems}
            size={audit.data.size}
            onPageChange={(nextPage) => setParam('page', String(nextPage), { resetPage: false })}
          />
        </>
      ) : null}
    </section>
  );
}
