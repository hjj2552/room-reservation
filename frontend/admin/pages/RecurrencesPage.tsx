import { RefreshCw, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import type { ConflictPolicy, RecurrenceFilters, RecurrenceStatus } from '../../shared/api/types';
import { Pagination } from '../../shared/components/Pagination';
import { TimeRangeSelect } from '../../shared/components/ReservationTimeRangeInput';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCreateRecurrence,
  usePreviewRecurrence,
  useRecurrences,
} from '../../shared/hooks/useRecurrences';
import { useRooms } from '../../shared/hooks/useRooms';
import { useSettings } from '../../shared/hooks/useSettings';
import { useTags } from '../../shared/hooks/useTags';
import { formatDate, formatDateTime, formatTime } from '../../shared/utils/date';
import { conflictPolicyLabels, dayLabels } from '../../shared/utils/labels';
import { defaultOperatingTimeRange } from '../../shared/utils/reservationTime';

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
};

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const pageSize = 20;

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function RecurrencesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const [form, setForm] = useState<RecurrenceForm>(initialForm);
  const defaultTimesAppliedRef = useRef(false);
  const rooms = useRooms();
  const settings = useSettings();
  const tags = useTags({ size: 1000 });
  const preview = usePreviewRecurrence();
  const create = useCreateRecurrence();

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(window.location.search);
  }, [searchParams]);

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

  const statusParam = searchParams.get('status');
  const status = statusParam === null || statusParam === 'ALL' ? '' : (statusParam as RecurrenceStatus);
  const roomId = searchParams.get('roomId') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const keyword = searchParams.get('keyword') || '';
  const page = numberParam(searchParams.get('page'), 0);

  const filters = useMemo<RecurrenceFilters>(
    () => ({
      status,
      roomId,
      fromDate,
      toDate,
      keyword,
      includeDeleted: status !== 'ACTIVE',
      page,
      size: pageSize,
    }),
    [status, roomId, fromDate, toDate, keyword, page],
  );
  const recurrences = useRecurrences(filters);

  function basePayload() {
    return {
      roomId: form.roomId,
      startDate: form.startDate,
      endDate: form.endDate,
      daysOfWeek: form.daysOfWeek,
      startTime: `${form.startTime}:00`,
      endTime: `${form.endTime}:00`,
      applicantPhone: form.applicantPhone,
      conflictPolicy: form.conflictPolicy,
    };
  }

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    preview.mutate(basePayload());
  }

  function handleCreate() {
    create.mutate({
      ...basePayload(),
      applicantName: form.applicantName,
      applicantEmail: form.applicantEmail,
      applicantPhone: form.applicantPhone,
      purpose: form.purpose,
      tagId: form.tagId || null,
    });
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((item) => item !== day)
        : [...prev.daysOfWeek, day],
    }));
  }

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

  function handleListFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParam('page', '0', { resetPage: false });
  }

  return (
    <section className="page-section" aria-labelledby="recurrences-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="recurrences-title">반복 예약</h1>
          <p className="muted">먼저 미리보기로 충돌 여부를 확인한 뒤 등록 정책을 선택합니다.</p>
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
              {rooms.data?.items.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </label>
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
          <label>
            이메일
            <input
              data-testid="recurrence-email-input"
              name="applicantEmail"
              type="email"
              value={form.applicantEmail}
              onChange={(event) => setForm((prev) => ({ ...prev, applicantEmail: event.target.value }))}
              required
            />
          </label>
          <label>
            전화번호
            <input
              data-testid="recurrence-phone-input"
              name="applicantPhone"
              value={form.applicantPhone}
              onChange={(event) => setForm((prev) => ({ ...prev, applicantPhone: event.target.value }))}
              required
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
              onChange={(event) => setForm((prev) => ({ ...prev, tagId: event.target.value }))}
            >
              <option value="">없음</option>
              {tags.data?.items.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>
          <fieldset className="full-span checkbox-group">
            <legend>반복 요일</legend>
            {days.map((day) => (
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
            등록 정책
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
          {create.data ? (
            <div className="success-box full-span" role="status">
              등록 완료: 등록 {create.data.createdCount}건, 건너뜀 {create.data.skippedCount}건, 실패 {create.data.failedCount}건
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
              disabled={!preview.data?.createAllowed || create.isPending}
              onClick={handleCreate}
            >
              {create.isPending ? '등록 중...' : '반복 예약 등록'}
            </button>
          </div>
        </form>

        <section className="panel" aria-labelledby="preview-title">
          <h2 id="preview-title">미리보기 결과</h2>
          {!preview.data && !preview.isPending ? (
            <EmptyState message="입력 후 미리보기를 실행하세요." />
          ) : null}
          {preview.data ? (
            <>
              <div className="summary-cards" data-testid="recurrence-preview-summary">
                <div><strong>{preview.data.totalCandidates}</strong><span>전체 후보</span></div>
                <div><strong>{preview.data.availableCount}</strong><span>가능</span></div>
                <div><strong>{preview.data.conflictCount}</strong><span>충돌</span></div>
                <div><strong>{preview.data.createAllowed ? '가능' : '불가능'}</strong><span>생성 여부</span></div>
              </div>
              <div className="table-wrap compact">
                <table className="data-table" data-testid="recurrence-preview-table">
                  <caption className="sr-only">반복 예약 미리보기 결과</caption>
                  <thead>
                    <tr>
                      <th scope="col">날짜</th>
                      <th scope="col">시간</th>
                      <th scope="col">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.items.map((item) => (
                      <tr key={`${item.date}-${item.startAt}`}>
                        <td>{formatDate(item.date)}</td>
                        <td>{formatDateTime(item.startAt)} ~ {formatDateTime(item.endAt)}</td>
                        <td>
                          {item.available ? '가능' : `충돌${item.reason ? `: ${item.reason}` : ''}`}
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
        <form className="filter-bar" onSubmit={handleListFilterSubmit}>
          <label>
            상태
            <select
              data-testid="recurrence-status-filter"
              value={status || 'ALL'}
              onChange={(event) => setParam('status', event.target.value)}
            >
              <option value="ACTIVE">운영 중</option>
              <option value="CANCELLED">취소됨</option>
              <option value="ALL">전체</option>
            </select>
          </label>
          <label>
            공간
            <select
              data-testid="recurrence-list-room-filter"
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
            시작일
            <input
              data-testid="recurrence-list-from-date-filter"
              type="date"
              value={fromDate}
              onChange={(event) => setParam('fromDate', event.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              data-testid="recurrence-list-to-date-filter"
              type="date"
              value={toDate}
              onChange={(event) => setParam('toDate', event.target.value)}
            />
          </label>
          <label>
            검색어
            <input
              data-testid="recurrence-list-keyword-filter"
              type="search"
              placeholder="태그, 신청자, 목적"
              value={keyword}
              onChange={(event) => setParam('keyword', event.target.value)}
            />
          </label>
          <button type="submit" className="secondary-button" data-testid="recurrence-list-search-button">
            <Search size={16} aria-hidden="true" />
            조회
          </button>
        </form>
        {recurrences.isLoading ? <LoadingState /> : null}
        {recurrences.isError ? <ErrorState error={recurrences.error} /> : null}
        {recurrences.data?.items.length === 0 ? <EmptyState message="조건에 맞는 반복 예약이 없습니다." /> : null}
        {recurrences.data?.items.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table" data-testid="recurrences-table">
                <caption className="sr-only">반복 예약 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">상태</th>
                    <th scope="col">공간</th>
                    <th scope="col">기간</th>
                    <th scope="col">요일/시간</th>
                    <th scope="col">목적</th>
                    <th scope="col">등록 정책</th>
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
                        <span className={`plain-badge ${item.deleted ? 'muted-badge' : 'good'}`}>
                          {item.deleted ? '취소됨' : '운영 중'}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/admin/recurrences/${item.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {item.roomName}
                        </Link>
                      </td>
                      <td>{formatDate(item.startDate)} ~ {formatDate(item.endDate)}</td>
                      <td>
                        {formatDayCodes(item.daysOfWeek)}
                        <br />
                        <span className="muted">{formatTime(item.startTime)}~{formatTime(item.endTime)}</span>
                      </td>
                      <td className="purpose-cell">
                        {item.tagName ? (
                          <span
                            className="series-chip"
                            style={item.tagColor ? { borderColor: item.tagColor, color: item.tagColor } : undefined}
                          >
                            {item.tagName}
                          </span>
                        ) : null}
                        {item.purpose}
                      </td>
                      <td>{conflictPolicyLabels[item.conflictPolicy]}</td>
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
              onPageChange={(nextPage) => setParam('page', String(nextPage), { resetPage: false })}
            />
          </>
        ) : null}
      </section>
    </section>
  );
}

function formatDayCodes(daysOfWeek: string) {
  return daysOfWeek
    .split(',')
    .map((day) => dayLabels[day.trim()] || day.trim())
    .join(', ');
}
