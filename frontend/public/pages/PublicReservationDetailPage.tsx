import { PenLine, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import { ReservationDetailView, reservationCoreSections } from '../../shared/components/ReservationDetailView';
import { ReservationPasswordDialog } from '../../shared/components/ReservationPasswordDialog';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCancelPublicReservation,
  usePublicReservationDetail,
  useVerifyPublicReservationForEdit,
} from '../../shared/hooks/usePublicReservation';
import { formatDateTime } from '../../shared/utils/date';
import { maskEmail, maskName, maskPhone } from '../../shared/utils/privacyMasking';

type PasswordAction = 'edit' | 'cancel';

export function PublicReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const detail = usePublicReservationDetail(reservationId);
  const cancel = useCancelPublicReservation(reservationId);
  const verify = useVerifyPublicReservationForEdit(reservationId);
  const [reservationPassword, setReservationPassword] = useState('');
  const [passwordAction, setPasswordAction] = useState<PasswordAction | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  function openPasswordDialog(action: PasswordAction) {
    verify.reset();
    cancel.reset();
    setCancelSuccess(false);
    setReservationPassword('');
    setPasswordAction(action);
  }

  function closePasswordDialog() {
    verify.reset();
    setPasswordAction(null);
    setReservationPassword('');
  }

  function verifyReservationPassword() {
    if (!passwordAction) return;
    verify.mutate(reservationPassword, {
      onSuccess: (verifiedReservation) => {
        if (passwordAction === 'edit') {
          navigate(`/reservations/${verifiedReservation.id}/edit`, {
            state: { verifiedReservation, reservationPassword },
          });
          return;
        }
        cancel.reset();
        setPasswordAction(null);
        setShowCancelConfirmation(true);
      },
    });
  }

  function confirmCancellation() {
    cancel.mutate(reservationPassword, {
      onSuccess: () => {
        setShowCancelConfirmation(false);
        setReservationPassword('');
        setCancelSuccess(true);
      },
    });
  }

  function closeCancelConfirmation() {
    cancel.reset();
    setShowCancelConfirmation(false);
    setReservationPassword('');
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
          {reservation.cancellable ? (
            <div className="button-row">
              {reservation.editable ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openPasswordDialog('edit')}
                  data-testid="public-reservation-edit-link"
                >
                  <PenLine size={16} aria-hidden="true" />
                  예약 수정
                </button>
              ) : null}
              <button type="button" className="danger-button" onClick={() => openPasswordDialog('cancel')}>
                <X size={16} aria-hidden="true" />
                예약 신청 취소
              </button>
            </div>
          ) : null}
          {!reservation.editable ? <p className="muted">취소된 예약은 수정할 수 없습니다.</p> : null}
          {!reservation.cancellable ? <p className="muted">현재 상태에서는 취소할 수 없습니다.</p> : null}
          {cancelSuccess ? <div className="success-box" role="status">예약 신청을 취소했습니다.</div> : null}
        </section>
      </div>

      <ReservationPasswordDialog
        open={passwordAction !== null}
        password={reservationPassword}
        isPending={verify.isPending}
        errorMessage={verify.isError ? errorMessage(verify.error) : undefined}
        inputTestId={passwordAction === 'edit' ? 'public-edit-password-input' : 'public-cancel-password-input'}
        submitTestId={passwordAction === 'edit' ? 'public-edit-verify-button' : 'public-cancel-submit-button'}
        onPasswordChange={setReservationPassword}
        onClose={closePasswordDialog}
        onSubmit={verifyReservationPassword}
      />

      {showCancelConfirmation ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-panel reservation-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-cancel-confirm-title"
            aria-describedby="public-cancel-confirm-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !cancel.isPending) closeCancelConfirmation();
            }}
          >
            <div className="modal-header">
              <h2 id="public-cancel-confirm-title">예약 신청을 취소할까요?</h2>
            </div>
            <p id="public-cancel-confirm-description" className="muted">
              취소하면 공개 화면에서 이 예약을 수정하거나 다시 활성화할 수 없습니다.
            </p>
            {cancel.isError ? <div className="inline-error" role="alert">{errorMessage(cancel.error)}</div> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={closeCancelConfirmation}
                disabled={cancel.isPending}
                autoFocus
              >
                돌아가기
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmCancellation}
                disabled={cancel.isPending}
                data-testid="public-cancel-confirm-button"
              >
                {cancel.isPending ? '취소 중...' : '예약 신청 취소'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
