import { RefreshCw } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import type { ConflictPolicy } from '../../shared/api/types';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCreateRecurrence,
  usePreviewRecurrence,
  useRecurrences,
} from '../../shared/hooks/useRecurrences';
import { useRooms } from '../../shared/hooks/useRooms';
import { formatDate, formatDateTime, formatTime } from '../../shared/utils/date';
import { conflictPolicyLabels, dayLabels } from '../../shared/utils/labels';

interface RecurrenceForm {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  seriesLabel: string;
  seriesColor: string;
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
  seriesLabel: '',
  seriesColor: '#2563eb',
  startDate: '',
  endDate: '',
  daysOfWeek: [],
  startTime: '09:00',
  endTime: '10:00',
  conflictPolicy: 'FAIL_ALL',
};

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function RecurrencesPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RecurrenceForm>(initialForm);
  const rooms = useRooms();
  const preview = usePreviewRecurrence();
  const create = useCreateRecurrence();
  const recurrences = useRecurrences(true);

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
      seriesLabel: form.seriesLabel || undefined,
      seriesColor: form.seriesColor || undefined,
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
            강의실
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
            태그
            <input
              data-testid="recurrence-series-label-input"
              name="seriesLabel"
              value={form.seriesLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, seriesLabel: event.target.value }))}
              placeholder="예: 1학년, 2학년"
            />
          </label>
          <label>
            표시 색상
            <input
              data-testid="recurrence-series-color-input"
              name="seriesColor"
              type="color"
              value={form.seriesColor}
              onChange={(event) => setForm((prev) => ({ ...prev, seriesColor: event.target.value }))}
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
          <label>
            시작 시간
            <input
              data-testid="recurrence-start-time-input"
              name="startTime"
              type="time"
              value={form.startTime}
              onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
              required
            />
          </label>
          <label>
            종료 시간
            <input
              data-testid="recurrence-end-time-input"
              name="endTime"
              type="time"
              value={form.endTime}
              onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
              required
            />
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

      <section className="panel" aria-labelledby="recurrence-list-title">
        <div className="panel-header">
          <h2 id="recurrence-list-title">반복 예약 목록</h2>
        </div>
        {recurrences.isLoading ? <LoadingState /> : null}
        {recurrences.isError ? <ErrorState error={recurrences.error} /> : null}
        {recurrences.data?.items.length === 0 ? <EmptyState message="등록된 반복 예약이 없습니다." /> : null}
        {recurrences.data?.items.length ? (
          <div className="table-wrap">
            <table className="data-table" data-testid="recurrences-table">
              <caption className="sr-only">반복 예약 목록</caption>
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  <th scope="col">강의실</th>
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
                      {item.seriesLabel ? (
                        <span
                          className="series-chip"
                          style={item.seriesColor ? { borderColor: item.seriesColor, color: item.seriesColor } : undefined}
                        >
                          {item.seriesLabel}
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
