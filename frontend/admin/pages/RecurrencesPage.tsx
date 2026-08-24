import { RefreshCw, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/http';
import type {
  ConflictPolicy,
  RecurrenceCreatePayload,
  RecurrenceCreateResult,
  RecurrenceFilters,
  RecurrencePreview,
  RecurrencePreviewPayload,
} from '../../shared/api/types';
import { Pagination } from '../../shared/components/Pagination';
import { TimeRangeSelect } from '../../shared/components/ReservationTimeRangeInput';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCreateRecurrence,
  usePreviewRecurrence,
  useRecurrences,
} from '../../shared/hooks/useRecurrences';
import { useRoomOptions } from '../../shared/hooks/useRooms';
import { useSettings } from '../../shared/hooks/useSettings';
import { useAllTags } from '../../shared/hooks/useTags';
import { formatDate, formatInstantTime, formatTime } from '../../shared/utils/date';
import { conflictPolicyLabels, dayLabels } from '../../shared/utils/labels';
import { lastPageIndex, parsePageParam } from '../../shared/utils/page';
import { defaultOperatingTimeRange } from '../../shared/utils/reservationTime';
import {
  canonicalizeWeekdayCodes,
  formatDayCodes,
  toggleWeekday,
  WEEKDAY_ORDER,
} from '../../shared/utils/weekdays';
import { optionalContact } from '../utils/optionalContact';
import { recurrencePreviewFingerprint } from '../utils/recurrencePreview';
import { useImeSafeSubmit } from '../hooks/useImeSafeSubmit';

interface RecurrenceForm {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  tagId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  conflictPolicy: ConflictPolicy;
  showApplicantName: boolean;
}

interface SuccessfulPreview {
  fingerprint: string;
  data: RecurrencePreview;
}

interface CompletedCreate {
  purpose: string;
  result: RecurrenceCreateResult;
}

interface RecurrenceFilterDraft {
  roomId: string;
  fromDate: string;
  toDate: string;
  keyword: string;
}

const initialForm: RecurrenceForm = {
  roomId: '',
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  purpose: '',
  tagId: '',
  startDate: '',
  endDate: '',
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  conflictPolicy: 'FAIL_ALL',
  showApplicantName: false,
};

const pageSize = 20;

function filterDraftFromParams(searchParams: URLSearchParams): RecurrenceFilterDraft {
  return {
    roomId: searchParams.get('roomId') || '',
    fromDate: searchParams.get('fromDate') || '',
    toDate: searchParams.get('toDate') || '',
    keyword: searchParams.get('keyword') || '',
  };
}

function sameFilterDraft(first: RecurrenceFilterDraft, second: RecurrenceFilterDraft) {
  return first.roomId === second.roomId
    && first.fromDate === second.fromDate
    && first.toDate === second.toDate
    && first.keyword === second.keyword;
}

function previewPayload(form: RecurrenceForm): RecurrencePreviewPayload {
  return {
    roomId: form.roomId,
    startDate: form.startDate,
    endDate: form.endDate,
    daysOfWeek: canonicalizeWeekdayCodes(form.daysOfWeek),
    startTime: `${form.startTime}:00`,
    endTime: `${form.endTime}:00`,
    applicantPhone: optionalContact(form.applicantPhone),
    conflictPolicy: form.conflictPolicy,
  };
}

function createPayload(form: RecurrenceForm): RecurrenceCreatePayload {
  return {
    ...previewPayload(form),
    applicantName: form.applicantName,
    applicantEmail: optionalContact(form.applicantEmail),
    applicantPhone: optionalContact(form.applicantPhone),
    purpose: form.purpose,
    tagId: form.tagId || null,
    showApplicantName: form.showApplicantName,
  };
}

export function RecurrencesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const [form, setForm] = useState<RecurrenceForm>(initialForm);
  const [successfulPreview, setSuccessfulPreview] = useState<SuccessfulPreview | null>(null);
  const [completedCreate, setCompletedCreate] = useState<CompletedCreate | null>(null);
  const endDateMax = useMemo(() => {
    const startDate = new Date(`${form.startDate}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== form.startDate) return undefined;
    startDate.setUTCDate(startDate.getUTCDate() + 365);
    return startDate.toISOString().slice(0, 10);
  }, [form.startDate]);
  const defaultTimesAppliedRef = useRef(false);
  const previewRequestIdRef = useRef(0);
  const createInFlightRef = useRef(false);
  const rooms = useRoomOptions();
  const settings = useSettings();
  const tags = useAllTags();
  const preview = usePreviewRecurrence();
  const create = useCreateRecurrence();
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

  useEffect(() => {
    if (!settings.data || defaultTimesAppliedRef.current) return;
    const suggested = defaultOperatingTimeRange(settings.data);
    setForm((current) => ({
      ...current,
      startTime: suggested.startTime,
      endTime: suggested.endTime,
    }));
    defaultTimesAppliedRef.current = true;
  }, [settings.data]);

  const { roomId, fromDate, toDate, keyword } = appliedFilters;
  const pageParam = searchParams.get('page');
  const page = parsePageParam(pageParam);

  const filters = useMemo<RecurrenceFilters>(
    () => ({
      roomId,
      fromDate,
      toDate,
      keyword,
      page,
      size: pageSize,
    }),
    [roomId, fromDate, toDate, keyword, page],
  );
  const recurrences = useRecurrences(filters, { keepPreviousData: true });

  useEffect(() => {
    const invalidPage = pageParam !== null && pageParam !== String(page);
    if (!invalidPage && (
      !recurrences.data
      || recurrences.isPlaceholderData
      || page < recurrences.data.totalPages
    )) return;
    const nextPage = invalidPage ? 0 : lastPageIndex(recurrences.data!.totalPages);
    if (!invalidPage && page === nextPage) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    searchParamsRef.current = next;
    setSearchParams(next, { replace: true });
  }, [page, pageParam, recurrences.data, recurrences.isPlaceholderData, searchParams, setSearchParams]);
  const currentPreviewFingerprint = recurrencePreviewFingerprint(form);
  const previewFingerprintMatches = successfulPreview?.fingerprint === currentPreviewFingerprint;
  const previewIsValid = previewFingerprintMatches && !preview.isPending && !preview.isError;
  const validPreview = previewIsValid ? successfulPreview.data : null;
  const previewIsStale = successfulPreview !== null && !previewFingerprintMatches;
  const previewCancelledCount = validPreview?.items.filter(
    (item) => item.reason === 'TIME_SLOT_CONFLICT',
  ).length ?? 0;
  const previewSkippedCount = validPreview
    ? validPreview.conflictCount - previewCancelledCount
    : 0;

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview.isPending) return;
    const payload = previewPayload(form);
    const fingerprint = recurrencePreviewFingerprint(payload);
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    preview.mutate(payload, {
      onSuccess: (data) => {
        if (previewRequestIdRef.current === requestId) {
          setSuccessfulPreview({ fingerprint, data });
        }
      },
    });
  }

  function handleCreate() {
    if (
      !validPreview?.createAllowed
      || successfulPreview?.fingerprint !== currentPreviewFingerprint
      || create.isPending
      || createInFlightRef.current
    ) return;

    const payload = createPayload(form);
    if (recurrencePreviewFingerprint(payload) !== successfulPreview.fingerprint) return;

    createInFlightRef.current = true;
    create.mutate(payload, {
      onSuccess: (result) => setCompletedCreate({ purpose: payload.purpose, result }),
      onSettled: () => {
        createInFlightRef.current = false;
      },
    });
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: toggleWeekday(prev.daysOfWeek, day),
    }));
  }

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

  function applyListFilters() {
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

  const listFilterSubmission = useImeSafeSubmit(applyListFilters);

  return (
    <section className="page-section" aria-labelledby="recurrences-title">
      <div className="page-header">
        <div>
          <h1 id="recurrences-title">반복 예약</h1>
          <p className="muted">먼저 미리보기로 충돌 여부를 확인한 뒤 충돌 정책을 선택합니다.</p>
        </div>
      </div>

      <div className="detail-grid">
        <form className="panel form-grid" data-testid="recurrence-form" onSubmit={handlePreview}>
          <h2 className="full-span">반복 예약 입력</h2>
          <label>
            예약 공간
            <select
              data-testid="recurrence-room-select"
              name="roomId"
              value={form.roomId}
              onChange={(event) => setForm((prev) => ({ ...prev, roomId: event.target.value }))}
              required
            >
              <option value="">선택</option>
              {rooms.data?.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </label>
          <div className="applicant-name-field">
            <label>
              신청자 이름
              <input
                data-testid="recurrence-applicant-name-input"
                name="applicantName"
                value={form.applicantName}
                onChange={(event) => setForm((prev) => ({ ...prev, applicantName: event.target.value }))}
                required
              />
            </label>
            <label className="applicant-name-visibility-toggle">
              <input
                type="checkbox"
                data-testid="recurrence-show-applicant-name-input"
                checked={form.showApplicantName}
                onChange={(event) => setForm((prev) => ({
                  ...prev,
                  showApplicantName: event.target.checked,
                }))}
              />
              신청자 이름 보이기
            </label>
          </div>
          <label>
            이메일 (선택)
            <input
              data-testid="recurrence-email-input"
              name="applicantEmail"
              type="email"
              value={form.applicantEmail}
              onChange={(event) => setForm((prev) => ({ ...prev, applicantEmail: event.target.value }))}
            />
          </label>
          <label>
            전화번호 (선택)
            <input
              data-testid="recurrence-phone-input"
              name="applicantPhone"
              value={form.applicantPhone}
              onChange={(event) => setForm((prev) => ({ ...prev, applicantPhone: event.target.value }))}
            />
          </label>
          <label className="full-span">
            예약 목적
            <input
              data-testid="recurrence-purpose-input"
              name="purpose"
              value={form.purpose}
              onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
              required
            />
          </label>
          <label>
            시작일
            <input
              data-testid="recurrence-start-date-input"
              name="startDate"
              type="date"
              value={form.startDate}
              onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
              required
            />
          </label>
          <label>
            종료일
            <input
              data-testid="recurrence-end-date-input"
              name="endDate"
              type="date"
              value={form.endDate}
              max={endDateMax}
              onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
              required
            />
          </label>
          <TimeRangeSelect
            startTime={form.startTime}
            endTime={form.endTime}
            openTime={settings.data?.openTime || '09:00'}
            closeTime={settings.data?.closeTime || '18:00'}
            minReservationMinutes={settings.data?.minReservationMinutes || 30}
            maxReservationMinutes={settings.data?.maxReservationMinutes || 240}
            onStartTimeChange={(value) => setForm((prev) => ({ ...prev, startTime: value }))}
            onEndTimeChange={(value) => setForm((prev) => ({ ...prev, endTime: value }))}
            startTestId="recurrence-start-time-input"
            endTestId="recurrence-end-time-input"
          />
          <label>
            태그
            <select
              data-testid="recurrence-tag-select"
              name="tagId"
              value={form.tagId}
              disabled={tags.isLoading || tags.isError}
              aria-describedby={tags.isError ? 'recurrence-tag-error' : undefined}
              onChange={(event) => setForm((prev) => ({ ...prev, tagId: event.target.value }))}
            >
              <option value="">없음</option>
              {tags.data?.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            {tags.isError ? (
              <span
                id="recurrence-tag-error"
                className="field-error"
                role="alert"
                data-testid="recurrence-tag-error"
              >
                태그 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </span>
            ) : null}
          </label>
          <fieldset className="full-span checkbox-group">
            <legend>반복 요일</legend>
            {WEEKDAY_ORDER.map((day) => (
              <label key={day}>
                <input
                  data-testid={`recurrence-day-${day}`}
                  type="checkbox"
                  checked={form.daysOfWeek.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {dayLabels[day]}
              </label>
            ))}
          </fieldset>
          <label className="full-span">
            충돌 정책
            <select
              data-testid="recurrence-conflict-policy-select"
              name="conflictPolicy"
              value={form.conflictPolicy}
              onChange={(event) => setForm((prev) => ({ ...prev, conflictPolicy: event.target.value as ConflictPolicy }))}
            >
              {Object.entries(conflictPolicyLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {preview.isError ? <div className="inline-error full-span" role="alert">{errorMessage(preview.error)}</div> : null}
          {create.isError ? <div className="inline-error full-span" role="alert">{errorMessage(create.error)}</div> : null}
          {completedCreate ? (
            <div className="success-box full-span" role="status">
              ‘{completedCreate.purpose}’ 등록 완료: 등록 {completedCreate.result.createdCount}건, 충돌 취소 {completedCreate.result.cancelledCount}건, 건너뜀 {completedCreate.result.skippedCount}건, 실패 {completedCreate.result.failedCount}건
            </div>
          ) : null}
          <div className="button-row full-span">
            <button
              type="submit"
              className="secondary-button"
              data-testid="recurrence-preview-button"
              disabled={preview.isPending}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {preview.isPending ? '미리보기 중...' : '미리보기'}
            </button>
            <button
              type="button"
              className="primary-button"
              data-testid="recurrence-create-button"
              disabled={!validPreview?.createAllowed || create.isPending}
              onClick={handleCreate}
            >
              {create.isPending ? '등록 중...' : '반복 예약 등록'}
            </button>
          </div>
        </form>

        <section className="panel" aria-labelledby="preview-title">
          <h2 id="preview-title">미리보기 결과</h2>
          {!successfulPreview && !preview.isPending ? (
            <EmptyState message="입력 후 미리보기를 실행하세요." />
          ) : null}
          {previewIsStale ? (
            <div
              className="state-box"
              role="status"
              aria-live="polite"
              data-testid="recurrence-preview-stale"
            >
              반복 조건이 변경되었습니다. 다시 미리보기를 실행해 주세요.
            </div>
          ) : null}
          {validPreview ? (
            <>
              <div className="summary-cards" data-testid="recurrence-preview-summary">
                <div><strong>{validPreview.totalCandidates}</strong><span>전체 후보</span></div>
                <div><strong>{validPreview.availableCount}</strong><span>등록 가능</span></div>
                {validPreview.conflictPolicy === 'SKIP_CONFLICTS' ? (
                  <>
                    <div><strong>{previewCancelledCount}</strong><span>충돌 취소</span></div>
                    <div><strong>{previewSkippedCount}</strong><span>건너뜀</span></div>
                  </>
                ) : (
                  <div><strong>{validPreview.conflictCount}</strong><span>충돌</span></div>
                )}
                <div><strong>{validPreview.createAllowed ? '가능' : '불가능'}</strong><span>생성 여부</span></div>
              </div>
              <div className="table-wrap compact">
                <table className="data-table recurrence-preview-table" data-testid="recurrence-preview-table">
                  <caption className="sr-only">반복 예약 미리보기 결과</caption>
                  <thead>
                    <tr>
                      <th scope="col">날짜</th>
                      <th scope="col">시간</th>
                      <th scope="col">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validPreview.items.map((item) => (
                      <tr key={`${item.date}-${item.startAt}`}>
                        <td className="nowrap-cell">{formatDate(item.date)}</td>
                        <td>
                          <span className="table-cell-stack">
                            <span>{formatInstantTime(item.startAt)}</span>
                            <span className="muted">~ {formatInstantTime(item.endAt)}</span>
                          </span>
                        </td>
                        <td className="table-description-cell">
                          {item.available
                            ? '등록 예정'
                            : validPreview.conflictPolicy === 'SKIP_CONFLICTS' && item.reason === 'TIME_SLOT_CONFLICT'
                              ? '충돌 취소 예정'
                              : validPreview.conflictPolicy === 'SKIP_CONFLICTS'
                                ? `건너뜀${item.reason ? `: ${item.reason}` : ''}`
                                : `충돌${item.reason ? `: ${item.reason}` : ''}`}
                          {item.message ? <div className="muted">{item.message}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>

      <section className="panel recurrence-list-panel" aria-labelledby="recurrence-list-title">
        <div className="panel-header">
          <h2 id="recurrence-list-title">반복 예약 목록</h2>
        </div>
        <form className="filter-bar" onSubmit={listFilterSubmission.handleSubmit}>
          <label>
            공간
            <select
              data-testid="recurrence-list-room-filter"
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
              data-testid="recurrence-list-from-date-filter"
              type="date"
              value={draftFilters.fromDate}
              onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
            />
          </label>
          <label>
            종료일
            <input
              data-testid="recurrence-list-to-date-filter"
              type="date"
              value={draftFilters.toDate}
              onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
            />
          </label>
          <label>
            검색어
            <input
              data-testid="recurrence-list-keyword-filter"
              type="search"
              placeholder="태그, 신청자, 목적"
              value={draftFilters.keyword}
              onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
              {...listFilterSubmission.searchInputProps}
            />
          </label>
          <button type="submit" className="secondary-button" data-testid="recurrence-list-search-button">
            <Search size={16} aria-hidden="true" />
            조회
          </button>
        </form>
        <div data-testid="recurrence-list-results" aria-busy={recurrences.isFetching}>
          {recurrences.isLoading ? <LoadingState /> : null}
          {recurrences.isError ? <ErrorState error={recurrences.error} /> : null}
          {recurrences.data?.items.length === 0 ? <EmptyState message="조건에 맞는 반복 예약이 없습니다." /> : null}
          {recurrences.data?.items.length ? (
            <>
              <div className="table-wrap recurrences-table-wrap">
                <table className="data-table recurrences-table" data-testid="recurrences-table">
                  <caption className="sr-only">반복 예약 목록</caption>
                  <thead>
                    <tr>
                      <th scope="col">기간</th>
                      <th scope="col">요일/시간</th>
                      <th scope="col">공간</th>
                      <th scope="col">목적</th>
                      <th scope="col">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurrences.data.items.map((item) => (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        className="clickable-row"
                        onClick={() => navigate(`/admin/recurrences/${item.id}`)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter') navigate(`/admin/recurrences/${item.id}`);
                        }}
                      >
                        <td>
                          <span className="table-cell-stack">
                            <span>{formatDate(item.startDate)}</span>
                            <span className="muted">~ {formatDate(item.endDate)}</span>
                          </span>
                        </td>
                        <td>
                          <span className="table-cell-stack">
                            <span>{formatDayCodes(item.daysOfWeek)}</span>
                            <span className="muted">{formatTime(item.startTime)}~{formatTime(item.endTime)}</span>
                          </span>
                        </td>
                        <td className="table-room-cell">{item.roomName}</td>
                        <td className="purpose-cell table-description-cell">
                          {item.tagName ? (
                            <span
                              className="series-chip"
                              style={item.tagColor ? { borderColor: item.tagColor, color: item.tagColor } : undefined}
                            >
                              {item.tagName}
                            </span>
                          ) : null}
                          {item.purpose}
                          <div className="muted">{conflictPolicyLabels[item.conflictPolicy]}</div>
                        </td>
                        <td className="nowrap-cell">
                          <Link
                            className="text-link"
                            to={`/admin/recurrences/${item.id}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            상세 보기
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={recurrences.data.page}
                totalPages={recurrences.data.totalPages}
                totalItems={recurrences.data.totalItems}
                size={recurrences.data.size}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </div>
      </section>
    </section>
  );
}
