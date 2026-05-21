import { Check, PenLine, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/http';
import { ErrorState, LoadingState } from '../components/StateViews';
import { StatusBadge } from '../components/StatusBadge';
import {
  useReservation,
  useReservationAction,
  useReservationHistories,
} from '../hooks/useReservations';
import { formatDateTime } from '../utils/date';
import { historyActionLabel, sourceLabels, statusLabels } from '../utils/labels';

export function ReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const reservation = useReservation(reservationId);
  const histories = useReservationHistories(reservationId);
  const approve = useReservationAction(reservationId, 'approve');
  const cancel = useReservationAction(reservationId, 'cancel');
  const [memo, setMemo] = useState('');

  function performAction(action: 'approve' | 'cancel') {
    const mutation = action === 'approve' ? approve : cancel;
    mutation.mutate(memo || undefined, {
      onSuccess: () => setMemo(''),
    });
  }

  if (reservation.isLoading) return <LoadingState />;
  if (reservation.isError) return <ErrorState error={reservation.error} />;
  if (!reservation.data) return null;

  const detail = reservation.data;
  const isCancelled = detail.status === 'CANCELLED';

  return (
    <section className="page-section" aria-labelledby="reservation-detail-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">예약 상세</p>
          <h1 id="reservation-detail-title">{detail.room.name}</h1>
          <p className="muted">{formatDateTime(detail.startAt)} 예약</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate('/reservations')}>
            목록으로
          </button>
          <Link
            className="secondary-button"
            data-testid="reservation-edit-link"
            to={`/reservations/${detail.id}/edit`}
          >
            <PenLine size={16} aria-hidden="true" />
            예약 수정
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="basic-info-title">
          <div className="panel-header">
            <h2 id="basic-info-title">기본 정보</h2>
            <StatusBadge status={detail.status} />
          </div>
          <dl className="description-list">
            <div>
              <dt>강의실</dt>
              <dd>{detail.room.name} {detail.room.location ? `(${detail.room.location})` : ''}</dd>
            </div>
            <div>
              <dt>예약 시간</dt>
              <dd>{formatDateTime(detail.startAt)} ~ {formatDateTime(detail.endAt)}</dd>
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
              <dt>목적</dt>
              <dd data-testid="reservation-purpose">{detail.purpose}</dd>
            </div>
            <div>
              <dt>신청 경로</dt>
              <dd>{sourceLabels[detail.source]}</dd>
            </div>
            <div>
              <dt>반복 예약</dt>
              <dd>{detail.recurrenceId || '-'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="actions-title">
          <h2 id="actions-title">상태 처리</h2>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              performAction('approve');
            }}
          >
            <label>
              처리 메모
              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={4}
                placeholder="승인 또는 취소 사유를 남깁니다."
              />
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="primary-button"
                disabled={approve.isPending || detail.status === 'CONFIRMED' || isCancelled}
              >
                <Check size={16} aria-hidden="true" />
                승인 처리
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={cancel.isPending || isCancelled}
                onClick={() => performAction('cancel')}
              >
                <X size={16} aria-hidden="true" />
                취소 처리
              </button>
            </div>
            {approve.isError ? <div className="inline-error" role="alert">{errorMessage(approve.error)}</div> : null}
            {cancel.isError ? <div className="inline-error" role="alert">{errorMessage(cancel.error)}</div> : null}
          </form>
        </section>
      </div>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">처리 이력</h2>
        {histories.isLoading ? <LoadingState message="이력을 불러오는 중입니다." /> : null}
        {histories.isError ? <ErrorState error={histories.error} /> : null}
        {histories.data?.length ? (
          <ol className="timeline">
            {histories.data.map((history) => (
              <li key={history.id}>
                <strong>{historyActionLabel(history.action)}</strong>
                <span>
                  {history.beforeStatus ? statusLabels[history.beforeStatus] : '-'} →{' '}
                  {history.afterStatus ? statusLabels[history.afterStatus] : '-'}
                </span>
                <span className="muted">{formatDateTime(history.createdAt)} / {history.actorId}</span>
                {history.memo ? <p>{history.memo}</p> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </section>
  );
}
