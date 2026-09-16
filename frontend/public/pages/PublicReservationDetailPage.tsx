import { PenLine, X } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../shared/api/http';
import { ReservationDetailView, reservationCoreSections } from '../../shared/components/ReservationDetailView';
import { ModalDialog } from '../../shared/components/ModalDialog';
import { ReservationPasswordDialog } from '../../shared/components/ReservationPasswordDialog';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCancelPublicReservation,
  usePublicReservationDetail,
  useVerifyPublicReservationForEdit,
} from '../../shared/hooks/usePublicReservation';
import { formatDateTime } from '../../shared/utils/date';
import { maskEmail, maskPhone } from '../../shared/utils/privacyMasking';
import { PublicReservationToast } from '../../shared/components/PublicReservationToast';
import { canReturnToPublicTimetable, publicReservationTimetableUrl, type PublicReservationNavigationState } from '../../shared/utils/publicReservationNavigation';

type PasswordAction = 'edit' | 'cancel';

export function PublicReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as PublicReservationNavigationState | null;
  const detail = usePublicReservationDetail(reservationId);
  const cancel = useCancelPublicReservation(reservationId);
  const verify = useVerifyPublicReservationForEdit(reservationId);
  const [reservationPassword, setReservationPassword] = useState('');
  const [passwordAction, setPasswordAction] = useState<PasswordAction | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [completionToast, setCompletionToast] = useState<{ message: string } | null>(null);

  useLayoutEffect(() => {
    if (routeState?.editSuccess !== 'REQUESTED' && routeState?.editSuccess !== 'CONFIRMED') return;
    setCompletionToast({ message: routeState.editSuccess === 'CONFIRMED'
      ? '수정 완료. 다시 승인 대기로 변경되었습니다.'
      : '수정 완료. 승인 대기 상태를 유지합니다.' });
    // Consume the one-time feedback before another visit or reload can replay it.
    navigate(location.pathname, { replace: true, state: { timetableReturn: routeState.timetableReturn } });
  }, [location.pathname, navigate, routeState]);

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
            // Detail and edit occupy one history entry throughout the edit flow.
            replace: true,
            state: { verifiedReservation, reservationPassword, timetableReturn: routeState?.timetableReturn },
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

  function returnToTimetable() {
    if (!detail.data) return;
    const context = routeState?.timetableReturn;
    if (canReturnToPublicTimetable(context)) {
      navigate(-1);
      return;
    }
    const url = context?.url === '/timetable' || context?.url.startsWith('/timetable?')
      ? context.url : publicReservationTimetableUrl(detail.data);
    navigate(url, { replace: true });
  }

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState error={detail.error} />;
  if (!detail.data) return null;

  const reservation = detail.data;

  return (
    <main className="public-shell" aria-labelledby="public-reservation-detail-title">
      <div className="page-header">
        <div>
          <h1 id="public-reservation-detail-title">{reservation.room.name}</h1>
          <p className="muted">{formatDateTime(reservation.startAt)} 예약</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          data-testid="public-detail-timetable-link"
          onClick={returnToTimetable}
        >
          시간표로 돌아가기
        </button>
      </div>

      <div className="detail-grid public-detail-grid">
        <ReservationDetailView
          status={reservation.status}
          sections={reservationCoreSections({
            room: reservation.room,
            startAt: reservation.startAt,
            endAt: reservation.endAt,
            applicantName: reservation.applicantName || '',
            applicantEmail: maskEmail(reservation.applicantEmail),
            applicantPhone: maskPhone(reservation.applicantPhone),
            purpose: reservation.purpose,
          })}
        />
        <section className="panel public-detail-actions" aria-labelledby="public-actions-title">
          <h2 id="public-actions-title">상태 처리</h2>
          {reservation.cancellable ? (
            <div className="button-row" data-testid="public-detail-action-buttons">
              <button type="button" className="danger-button" onClick={() => openPasswordDialog('cancel')}>
                <X size={16} aria-hidden="true" />
                취소
              </button>
              {reservation.editable ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openPasswordDialog('edit')}
                  data-testid="public-reservation-edit-link"
                >
                  <PenLine size={16} aria-hidden="true" />
                  수정
                </button>
              ) : null}
            </div>
          ) : null}
          {!reservation.editable ? <p className="muted">취소된 예약은 수정할 수 없습니다.</p> : null}
          {!reservation.cancellable ? <p className="muted">현재 상태에서는 취소할 수 없습니다.</p> : null}
          {cancelSuccess ? <div className="success-box" role="status">예약을 취소했습니다.</div> : null}
        </section>
      </div>

      <PublicReservationToast toast={completionToast} onClose={setCompletionToast} testId="public-edit-success-toast" />

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
        <ModalDialog
          title="취소할까요?"
          titleId="public-cancel-confirm-title"
          ariaDescribedBy="public-cancel-confirm-description"
          className="reservation-password-modal"
          onClose={closeCancelConfirmation}
          closeDisabled={cancel.isPending}
        >
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
              {cancel.isPending ? '취소 중...' : '취소'}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </main>
  );
}
