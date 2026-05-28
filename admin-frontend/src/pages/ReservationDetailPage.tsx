import { CalendarDays, Check, PenLine, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, errorMessage } from '../api/http';
import { ReservationDetailView, reservationCoreSections } from '../components/ReservationDetailView';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  useDeleteReservation,
  useReservation,
  useReservationAction,
  useReservationHistories,
} from '../hooks/useReservations';
import { formatDateTime } from '../utils/date';
import { historyActionLabel, statusLabels } from '../utils/labels';
import { timetableReservationUrl } from '../utils/timetable';

export function ReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const reservation = useReservation(reservationId);
  const histories = useReservationHistories(reservationId, { enabled: Boolean(reservation.data) });
  const approve = useReservationAction(reservationId, 'approve');
  const cancel = useReservationAction(reservationId, 'cancel');
  const deleteReservation = useDeleteReservation(reservationId);
  const [memo, setMemo] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function performAction(action: 'approve' | 'cancel') {
    const mutation = action === 'approve' ? approve : cancel;
    mutation.mutate(memo || undefined, {
      onSuccess: () => setMemo(''),
    });
  }

  function performDelete() {
    deleteReservation.mutate(memo || undefined, {
      onSuccess: () => {
        setShowDeleteModal(false);
        navigate(`/audit?reservationId=${reservationId}&action=DELETED`);
      },
    });
  }

  if (reservation.isLoading) return <LoadingState />;
  if (reservation.isError && isReservationNotFound(reservation.error)) {
    return <DeletedReservationState reservationId={reservationId} />;
  }
  if (reservation.isError) return <ErrorState error={reservation.error} />;
  if (!reservation.data) return null;

  const detail = reservation.data;
  const isCancelled = detail.status === 'CANCELLED';

  return (
    <section className="page-section" aria-labelledby="reservation-detail-title">
      <div className="page-header reservation-detail-page-header">
        <div>
          <p className="eyebrow">예약 상세</p>
          <h1 id="reservation-detail-title">{detail.room.name}</h1>
          <p className="muted">{formatDateTime(detail.startAt)} 예약</p>
        </div>
        <div className="header-actions reservation-navigation-actions" aria-label="예약 상세 이동">
          <button type="button" className="ghost-button" onClick={() => navigate('/reservations')}>
            목록으로
          </button>
          <Link
            className="secondary-button"
            to={timetableReservationUrl({ startAt: detail.startAt, roomId: detail.room.id })}
            data-testid="reservation-detail-timetable-link"
          >
            <CalendarDays size={16} aria-hidden="true" />
            시간표에서 보기
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <ReservationDetailView
          status={detail.status}
          sections={reservationCoreSections({
            room: detail.room,
            startAt: detail.startAt,
            endAt: detail.endAt,
            applicantName: detail.applicantName,
            applicantEmail: detail.applicantEmail,
            applicantPhone: detail.applicantPhone,
            purpose: <span data-testid="reservation-purpose">{detail.purpose}</span>,
          })}
        />

        <section className="panel reservation-action-panel" aria-labelledby="actions-title">
          <div>
            <p className="eyebrow">운영 액션</p>
            <h2 id="actions-title">상태 처리</h2>
            <p className="muted">승인과 취소는 현재 예약 상태를 처리하는 주요 액션입니다.</p>
          </div>
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
            <div className="reservation-primary-actions">
              <div className="button-row" aria-label="주요 상태 처리">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={approve.isPending || detail.status === 'CONFIRMED' || isCancelled}
                >
                  <Check size={16} aria-hidden="true" />
                  승인
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={cancel.isPending || isCancelled}
                  onClick={() => performAction('cancel')}
                >
                  <X size={16} aria-hidden="true" />
                  취소
                </button>
              </div>
              <Link
                className="secondary-button reservation-edit-action"
                data-testid="reservation-edit-link"
                to={`/reservations/${detail.id}/edit`}
              >
                <PenLine size={16} aria-hidden="true" />
                예약 수정
              </Link>
            </div>
            {approve.isError ? <div className="inline-error" role="alert">{errorMessage(approve.error)}</div> : null}
            {cancel.isError ? <div className="inline-error" role="alert">{errorMessage(cancel.error)}</div> : null}
          </form>
        </section>
      </div>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">감사 이력</h2>
        {histories.isLoading ? <LoadingState message="감사 이력을 불러오는 중입니다." /> : null}
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

      <div className="reservation-delete-action">
        <button
          type="button"
          className="danger-button"
          disabled={deleteReservation.isPending}
          onClick={() => setShowDeleteModal(true)}
          data-testid="reservation-delete-button"
        >
          <Trash2 size={16} aria-hidden="true" />
          예약 삭제
        </button>
        {deleteReservation.isError ? <div className="inline-error" role="alert">{errorMessage(deleteReservation.error)}</div> : null}
      </div>

      {showDeleteModal ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-panel reservation-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-delete-modal-title"
            aria-describedby="reservation-delete-modal-description"
            data-testid="reservation-delete-modal"
          >
            <div className="modal-header">
              <h2 id="reservation-delete-modal-title">예약을 영구 삭제할까요?</h2>
            </div>
            <p id="reservation-delete-modal-description" className="danger-copy">
              삭제하면 이 예약의 상세 정보는 더 이상 조회할 수 없습니다. 감사 로그에는 삭제 기록과 처리 메모가 남습니다.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowDeleteModal(false)} autoFocus>
                돌아가기
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={deleteReservation.isPending}
                onClick={performDelete}
                data-testid="reservation-delete-confirm-button"
              >
                <Trash2 size={16} aria-hidden="true" />
                {deleteReservation.isPending ? '삭제 중...' : '예약 삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isReservationNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

function DeletedReservationState({ reservationId }: { reservationId: string }) {
  const navigate = useNavigate();

  return (
    <section className="page-section narrow" aria-labelledby="deleted-reservation-title">
      <div className="state-box error">
        <p className="eyebrow">예약 상세</p>
        <h1 id="deleted-reservation-title">삭제된 예약입니다</h1>
        <p>이 예약은 이미 삭제되어 상세 정보를 볼 수 없습니다. 감사 로그에서 삭제 기록은 계속 확인할 수 있습니다.</p>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            이전 페이지로 돌아가기
          </button>
          <Link className="secondary-button" to="/reservations">
            예약 목록으로 돌아가기
          </Link>
          <Link className="secondary-button" to={`/audit?reservationId=${reservationId}`}>
            감사 로그로 이동
          </Link>
        </div>
      </div>
    </section>
  );
}
