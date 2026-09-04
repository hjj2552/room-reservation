import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useImeSafeSubmit } from '../hooks/useImeSafeSubmit';

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

interface AuditFilterDraft {
  action: string;
  roomId: string;
  fromDate: string;
  toDate: string;
  keyword: string;
  reservationId: string;
}

function filterDraftFromParams(searchParams: URLSearchParams): AuditFilterDraft {
  return {
    action: searchParams.get('action') || '',
    roomId: searchParams.get('roomId') || '',
    fromDate: searchParams.get('fromDate') || '',
    toDate: searchParams.get('toDate') || '',
    keyword: searchParams.get('keyword') || '',
    reservationId: searchParams.get('reservationId') || '',
  };
}

function sameFilterDraft(first: AuditFilterDraft, second: AuditFilterDraft) {
  return first.action === second.action
    && first.roomId === second.roomId
    && first.fromDate === second.fromDate
    && first.toDate === second.toDate
    && first.keyword === second.keyword
    && first.reservationId === second.reservationId;
}

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

  const { action, roomId, fromDate, toDate, keyword, reservationId } = appliedFilters;
  const pageParam = searchParams.get('page');
  const page = parsePageParam(pageParam);

  const filters = useMemo(
    () => ({
      reservationId,
      roomId,
      action,
      from: toServiceStartOfDayOffset(fromDate),
      to: toServiceEndOfDayOffset(toDate),
      keyword,
      page,
      size: pageSize,
    }),
    [reservationId, roomId, action, fromDate, toDate, keyword, page],
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
    const normalizedDraft = {
      ...draftFilters,
      keyword: draftFilters.keyword.trim(),
      reservationId: draftFilters.reservationId.trim(),
    };
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

  return (
    <section className="page-section" aria-labelledby="audit-title">
      <div className="page-header">
        <div>
          <h1 id="audit-title">감사 이력</h1>
          <p className="muted">예약 신청, 수정, 승인, 취소 이력을 조건별로 조회합니다.</p>
        </div>
      </div>

      <form className="filter-bar audit-filter" onSubmit={filterSubmission.handleSubmit}>
        <label>
          처리 유형
          <select
            data-testid="audit-action-select"
            value={draftFilters.action}
            onChange={(event) => setDraftFilters((current) => ({ ...current, action: event.target.value }))}
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
          공간
          <select
            data-testid="audit-room-select"
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
            data-testid="audit-from-date-input"
            type="date"
            value={draftFilters.fromDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
          />
        </label>
        <label>
          종료일
          <input
            data-testid="audit-to-date-input"
            type="date"
            value={draftFilters.toDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
          />
        </label>
        <label className="audit-keyword-filter">
          검색어
          <input
            data-testid="audit-keyword-input"
            type="search"
            placeholder="공간, 신청자, 연락처, 목적, 처리자, 메모"
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            {...filterSubmission.searchInputProps}
          />
        </label>
        <label>
          예약 ID
          <input
            data-testid="audit-reservation-id-input"
            value={draftFilters.reservationId}
            onChange={(event) => setDraftFilters((current) => ({ ...current, reservationId: event.target.value }))}
          />
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
            onPageChange={setPage}
          />
        </>
      ) : null}
    </section>
  );
}
