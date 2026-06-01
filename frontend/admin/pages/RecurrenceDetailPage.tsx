import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useCancelRecurrence, useRecurrence } from '../../shared/hooks/useRecurrences';
import { formatDate, formatDateTime, formatTime } from '../../shared/utils/date';
import { conflictPolicyLabels } from '../../shared/utils/labels';

export function RecurrenceDetailPage() {
  const { recurrenceId = '' } = useParams();
  const navigate = useNavigate();
  const recurrence = useRecurrence(recurrenceId);
  const cancel = useCancelRecurrence();
  const [memo, setMemo] = useState('');

  function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancel.mutate(
      { recurrenceId, memo: memo || undefined },
      {
        onSuccess: () => {
          setMemo('');
          recurrence.refetch();
        },
      },
    );
  }

  if (recurrence.isLoading) return <LoadingState />;
  if (recurrence.isError) return <ErrorState error={recurrence.error} />;
  if (!recurrence.data) return null;

  const detail = recurrence.data;

  return (
    <section className="page-section" aria-labelledby="recurrence-detail-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="recurrence-detail-title">{detail.room.name}</h1>
          <p className="muted">{detail.purpose}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate('/admin/recurrences')}>
            목록으로
          </button>
          <Link className="secondary-button" to="/admin/reservations">
            예약 목록 보기
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="recurrence-basic-title">
          <div className="panel-header">
            <h2 id="recurrence-basic-title">기본 정보</h2>
            <span
              className={`plain-badge ${detail.deleted ? 'muted-badge' : 'good'}`}
              data-testid="recurrence-detail-status"
            >
              {detail.deleted ? '취소됨' : '운영 중'}
            </span>
          </div>
          <dl className="description-list">
            <div>
              <dt>강의실</dt>
              <dd data-testid="recurrence-detail-room">{detail.room.name} {detail.room.location ? `(${detail.room.location})` : ''}</dd>
            </div>
            <div>
              <dt>기간</dt>
              <dd data-testid="recurrence-detail-period">{formatDate(detail.startDate)} ~ {formatDate(detail.endDate)}</dd>
            </div>
            <div>
              <dt>요일/시간</dt>
              <dd data-testid="recurrence-detail-schedule">{detail.daysOfWeek} / {formatTime(detail.startTime)}~{formatTime(detail.endTime)}</dd>
            </div>
            <div>
              <dt>등록 정책</dt>
              <dd>{conflictPolicyLabels[detail.conflictPolicy]}</dd>
            </div>
            <div>
              <dt>신청자</dt>
              <dd>{detail.applicantName}</dd>
            </div>
            <div>
              <dt>연락처</dt>
              <dd>{detail.applicantEmail} / {detail.applicantPhone || '-'}</dd>
            </div>
            <div>
              <dt>등록일</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="recurrence-cancel-title">
          <h2 id="recurrence-cancel-title">반복 예약 취소</h2>
          <form className="form-stack" onSubmit={handleCancel}>
            <label>
              취소 메모
              <textarea
                data-testid="recurrence-detail-cancel-memo-input"
                rows={4}
                value={memo}
                disabled={detail.deleted}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="취소 사유를 남깁니다."
              />
            </label>
            {cancel.isError ? <div className="inline-error" role="alert">{errorMessage(cancel.error)}</div> : null}
            <button
              type="submit"
              className="danger-button"
              data-testid="recurrence-detail-cancel-button"
              disabled={detail.deleted || cancel.isPending}
            >
              {detail.deleted ? '이미 취소됨' : cancel.isPending ? '취소 중...' : '반복 예약 취소'}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
