import { X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/http';
import { ReservationDetailView, reservationCoreSections } from '../../shared/components/ReservationDetailView';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useCancelPublicReservation, usePublicReservationDetail } from '../../shared/hooks/usePublicReservation';
import { formatDateTime } from '../../shared/utils/date';
import { maskEmail, maskName, maskPhone } from '../../shared/utils/privacyMasking';

function publicErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.body?.code === 'PUBLIC_CANCEL_PASSWORD_MISMATCH') {
      return '취소 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
    }
    if (error.status === 400) return '입력한 정보를 다시 확인해 주세요.';
    if (error.status === 404) return '예약 정보를 찾을 수 없습니다.';
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function PublicReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const detail = usePublicReservationDetail(reservationId);
  const cancel = useCancelPublicReservation(reservationId);
  const [cancelPassword, setCancelPassword] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  function onCancelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancel.mutate(cancelPassword);
  }

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState error={detail.error} />;
  if (!detail.data) return null;

  const reservation = detail.data;

  return (
    <main className="public-shell" aria-labelledby="public-reservation-detail-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">일반 사용자</p>
          <h1 id="public-reservation-detail-title">{reservation.room.name}</h1>
          <p className="muted">{formatDateTime(reservation.startAt)} 예약</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            이전으로
          </button>
          <Link className="secondary-button" to="/reserve">
            시간표로 돌아가기
          </Link>
        </div>
      </div>

      <div className="detail-grid public-detail-grid">
        <ReservationDetailView
          status={reservation.status}
          sections={reservationCoreSections({
            room: reservation.room,
            startAt: reservation.startAt,
            endAt: reservation.endAt,
            applicantName: maskName(reservation.applicantName) || '',
            applicantEmail: maskEmail(reservation.applicantEmail),
            applicantPhone: maskPhone(reservation.applicantPhone),
            purpose: reservation.purpose,
          })}
        />
        <section className="panel public-detail-actions" aria-labelledby="public-actions-title">
          <h2 id="public-actions-title">상태 처리</h2>
          {reservation.cancellable && !showCancelForm ? (
            <div className="button-row">
              <button type="button" className="danger-button" onClick={() => setShowCancelForm(true)}>
                <X size={16} aria-hidden="true" />
                예약 신청 취소
              </button>
            </div>
          ) : null}
          {!reservation.cancellable ? <p className="muted">현재 상태에서는 취소할 수 없습니다.</p> : null}
          {showCancelForm ? (
            <form className="form-stack" onSubmit={onCancelSubmit}>
              <label>
                취소 비밀번호
                <input
                  type="password"
                  value={cancelPassword}
                  onChange={(event) => setCancelPassword(event.target.value)}
                  data-testid="public-cancel-password-input"
                />
              </label>
              {cancel.isError ? <div className="inline-error" role="alert">{publicErrorMessage(cancel.error)}</div> : null}
              {cancel.isSuccess ? <div className="success-box" role="status">예약 신청을 취소했습니다.</div> : null}
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={() => setShowCancelForm(false)}>
                  돌아가기
                </button>
                <button type="submit" className="danger-button" disabled={cancel.isPending} data-testid="public-cancel-submit-button">
                  {cancel.isPending ? '취소 중' : '비밀번호 확인 후 취소'}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}
