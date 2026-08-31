import { FormEvent, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Pagination } from '../../shared/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useReservationHistoryAudit } from '../../shared/hooks/useAudit';
import { useRoomOptions } from '../../shared/hooks/useRooms';
import type { ReservationHistory } from '../../shared/api/types';
import { formatDateTime } from '../../shared/utils/date';
import { historyActionLabel, statusLabels } from '../../shared/utils/labels';
import { lastPageIndex, parsePageParam } from '../../shared/utils/page';
import {
  reservationServiceTimeZone,
  toServiceEndOfDayOffset,
  toServiceStartOfDayOffset,
} from '../../shared/utils/reservationTime';

const pageSize = 20;
const snapshotDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: reservationServiceTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const snapshotTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: reservationServiceTimeZone,
  timeStyle: 'short',
});

const actions = [
  'CREATED_BY_ADMIN',
  'CREATED',
  'RECURRENCE_GENERATED',
  'UPDATED',
  'APPROVED',
  'CANCELLED',
  'DELETED',
  'RECURRENCE_CANCELLED',
];

function cleanSnapshotValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function reservationSnapshot(history: ReservationHistory) {
  return {
    roomName: cleanSnapshotValue(history.reservationRoomName) || '-',
    time: reservationTimeRange(history) || '-',
  };
}

function reservationTimeRange(history: ReservationHistory) {
  const startAt = cleanSnapshotValue(history.reservationStartAt);
  const endAt = cleanSnapshotValue(history.reservationEndAt);
  if (startAt && endAt) return `${formatDateTime(startAt)} ~ ${formatSnapshotEndTime(startAt, endAt)}`;
  if (startAt) return formatDateTime(startAt);
  if (endAt) return formatDateTime(endAt);
  return null;
}

function formatSnapshotEndTime(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (snapshotDateFormatter.format(start) !== snapshotDateFormatter.format(end)) {
    return formatDateTime(endAt);
  }
  return snapshotTimeFormatter.format(end);
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const rooms = useRoomOptions();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(window.location.search);
  }, [searchParams]);

  const reservationId = searchParams.get('reservationId') || '';
  const roomId = searchParams.get('roomId') || '';
  const action = searchParams.get('action') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const pageParam = searchParams.get('page');
  const page = parsePageParam(pageParam);

  const filters = useMemo(
    () => ({
      reservationId,
      roomId,
      action,
      from: toServiceStartOfDayOffset(fromDate),
      to: toServiceEndOfDayOffset(toDate),
      page,
      size: pageSize,
    }),
    [reservationId, roomId, action, fromDate, toDate, page],
  );
  const audit = useReservationHistoryAudit(filters);

  useEffect(() => {
    const invalidPage = pageParam !== null && pageParam !== String(page);
    if (!invalidPage && (!audit.data || page < audit.data.totalPages)) return;
    const nextPage = invalidPage ? 0 : lastPageIndex(audit.data!.totalPages);
    if (!invalidPage && page === nextPage) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    searchParamsRef.current = next;
    setSearchParams(next, { replace: true });
  }, [audit.data, page, pageParam, searchParams, setSearchParams]);

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
          <h1 id="audit-title">감사 이력</h1>
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
          공간
          <select
            data-testid="audit-room-select"
            value={roomId}
            onChange={(event) => setParam('roomId', event.target.value)}
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
            <table className="data-table audit-table" data-testid="audit-table">
              <caption className="sr-only">감사 이력</caption>
              <thead>
                <tr>
                  <th scope="col">처리 시각</th>
                  <th scope="col">처리 유형</th>
                  <th scope="col">대상 예약</th>
                  <th scope="col">상태 변경</th>
                  <th scope="col">처리자</th>
                  <th scope="col">메모</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((history) => {
                  const isDeleted = history.action === 'DELETED';
                  const snapshot = reservationSnapshot(history);
                  const summary = (
                    <span className="audit-reservation-snapshot">
                      <span className="audit-snapshot-room table-text-cell">{snapshot.roomName}</span>
                      <span className="audit-snapshot-time">{snapshot.time}</span>
                    </span>
                  );

                  return (
                    <tr key={history.id}>
                      <td className="nowrap-cell">{formatDateTime(history.createdAt)}</td>
                      <td className="nowrap-cell">{historyActionLabel(history.action)}</td>
                      <td>
                        {isDeleted ? summary : (
                          <Link
                            className="text-link audit-reservation-link"
                            to={`/admin/reservations/${history.reservationId}`}
                          >
                            {summary}
                          </Link>
                        )}
                      </td>
                      <td className="nowrap-cell">
                        {history.beforeStatus ? statusLabels[history.beforeStatus] : '-'} →{' '}
                        {history.afterStatus ? statusLabels[history.afterStatus] : '-'}
                      </td>
                      <td>
                        <span className="table-cell-stack audit-actor-cell">
                          <span className="table-text-cell">{history.actorId}</span>
                          <span className="muted">{history.actorType}</span>
                        </span>
                      </td>
                      <td className="table-text-cell processing-memo">{history.memo || '-'}</td>
                    </tr>
                  );
                })}
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
