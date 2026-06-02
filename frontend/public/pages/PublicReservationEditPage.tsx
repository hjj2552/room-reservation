import { KeyRound, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import type { PublicReservationEditDetail } from '../../shared/api/types';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  usePublicReservationDetail,
  usePublicRooms,
  useUpdatePublicReservation,
  useVerifyPublicReservationForEdit,
} from '../../shared/hooks/usePublicReservation';
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../../shared/utils/date';
import { statusLabels } from '../../shared/utils/labels';

interface PublicReservationEditValues {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
}

function valuesFromReservation(reservation: PublicReservationEditDetail): PublicReservationEditValues {
  return {
    roomId: reservation.room.id,
    applicantName: reservation.applicantName,
    applicantEmail: reservation.applicantEmail,
    applicantPhone: reservation.applicantPhone || '',
    purpose: reservation.purpose,
    startAt: toDateTimeLocal(reservation.startAt),
    endAt: toDateTimeLocal(reservation.endAt),
  };
}

export function PublicReservationEditPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const rooms = usePublicRooms();
  const detail = usePublicReservationDetail(reservationId);
  const verify = useVerifyPublicReservationForEdit(reservationId);
  const update = useUpdatePublicReservation(reservationId);
  const [cancelPassword, setCancelPassword] = useState('');
  const [verifiedReservation, setVerifiedReservation] = useState<PublicReservationEditDetail | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PublicReservationEditValues>({
    defaultValues: {
      roomId: '',
      applicantName: '',
      applicantEmail: '',
      applicantPhone: '',
      purpose: '',
      startAt: '',
      endAt: '',
    },
  });

  useEffect(() => {
    if (!verifiedReservation) return;
    reset(valuesFromReservation(verifiedReservation));
  }, [reset, verifiedReservation]);

  function onVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage('');
    verify.mutate(cancelPassword, {
      onSuccess: (reservation) => {
        setVerifiedReservation(reservation);
      },
    });
  }

  function onSubmit(values: PublicReservationEditValues) {
    if (!verifiedReservation) return;
    const previousStatus = verifiedReservation.status;
    update.mutate(
      {
        roomId: values.roomId,
        applicantName: values.applicantName,
        applicantEmail: values.applicantEmail,
        applicantPhone: values.applicantPhone,
        purpose: values.purpose,
        startAt: fromDateTimeLocal(values.startAt),
        endAt: fromDateTimeLocal(values.endAt),
        cancelPassword,
      },
      {
        onSuccess: () => {
          setSuccessMessage(
            previousStatus === 'CONFIRMED'
              ? '수정 완료. 다시 승인 대기로 변경되었습니다.'
              : '수정 완료. 승인 대기 상태를 유지합니다.',
          );
          setVerifiedReservation((current) => current ? { ...current, ...values, status: 'REQUESTED' } : current);
        },
      },
    );
  }

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState error={detail.error} />;
  if (!detail.data) return null;

  const reservation = detail.data;
  const isEditable = reservation.editable;

  return (
    <main className="public-shell" aria-labelledby="public-reservation-edit-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">일반 사용자</p>
          <h1 id="public-reservation-edit-title">예약 수정</h1>
          <p className="muted">
            {reservation.room.name} · {formatDateTime(reservation.startAt)} · {statusLabels[reservation.status]}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            이전으로
          </button>
          <Link className="secondary-button" to={`/reservations/${reservation.id}`}>
            상세로
          </Link>
        </div>
      </div>

      {!isEditable ? (
        <section className="state-box error" aria-live="polite">
          <h2>수정할 수 없는 예약입니다</h2>
          <p>취소된 예약은 공개 화면에서 수정하거나 복구할 수 없습니다.</p>
        </section>
      ) : null}

      {isEditable ? (
        <section className="panel form-stack" aria-labelledby="public-edit-password-title">
          <div className="panel-header">
            <h2 id="public-edit-password-title">본인 확인</h2>
          </div>
          <form className="form-stack" onSubmit={onVerifySubmit}>
            <label>
              예약 비밀번호
              <input
                type="password"
                value={cancelPassword}
                onChange={(event) => setCancelPassword(event.target.value)}
                data-testid="public-edit-password-input"
              />
            </label>
            {verify.isError ? <div className="inline-error" role="alert">{errorMessage(verify.error)}</div> : null}
            <div className="button-row">
              <button
                type="submit"
                className="secondary-button"
                disabled={verify.isPending || cancelPassword.length < 4}
                data-testid="public-edit-verify-button"
              >
                <KeyRound size={16} aria-hidden="true" />
                {verify.isPending ? '확인 중...' : '예약 정보 불러오기'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {verifiedReservation ? (
        <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)} aria-label="예약 수정 입력">
          <label className="full-span">
            신청 목적
            <input
              data-testid="public-edit-purpose-input"
              {...register('purpose', { required: '예약 목적을 입력해 주세요.' })}
            />
            {errors.purpose ? <span className="field-error">{errors.purpose.message}</span> : null}
          </label>
          <label>
            강의실
            <select data-testid="public-edit-room-select" {...register('roomId', { required: '강의실을 선택해 주세요.' })}>
              <option value="">선택</option>
              {rooms.data?.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {errors.roomId ? <span className="field-error">{errors.roomId.message}</span> : null}
          </label>
          <label>
            현재 상태
            <input value={statusLabels[verifiedReservation.status]} readOnly data-testid="public-edit-status-input" />
          </label>
          <label>
            시작 시간
            <input
              data-testid="public-edit-start-input"
              type="datetime-local"
              {...register('startAt', { required: '시작 시간을 입력해 주세요.' })}
            />
            {errors.startAt ? <span className="field-error">{errors.startAt.message}</span> : null}
          </label>
          <label>
            종료 시간
            <input
              data-testid="public-edit-end-input"
              type="datetime-local"
              {...register('endAt', { required: '종료 시간을 입력해 주세요.' })}
            />
            {errors.endAt ? <span className="field-error">{errors.endAt.message}</span> : null}
          </label>
          <label>
            신청자 이름
            <input
              data-testid="public-edit-applicant-name-input"
              {...register('applicantName', { required: '신청자 이름을 입력해 주세요.' })}
            />
            {errors.applicantName ? <span className="field-error">{errors.applicantName.message}</span> : null}
          </label>
          <label>
            이메일
            <input
              data-testid="public-edit-email-input"
              type="email"
              {...register('applicantEmail', { required: '이메일을 입력해 주세요.' })}
            />
            {errors.applicantEmail ? <span className="field-error">{errors.applicantEmail.message}</span> : null}
          </label>
          <label>
            전화번호
            <input
              data-testid="public-edit-phone-input"
              placeholder="- 제외하고 입력"
              {...register('applicantPhone', { required: '전화번호를 입력해 주세요.' })}
            />
            {errors.applicantPhone ? <span className="field-error">{errors.applicantPhone.message}</span> : null}
          </label>
          {update.isError ? <div className="inline-error full-span" role="alert">{errorMessage(update.error)}</div> : null}
          {successMessage ? <div className="success-box full-span" role="status">{successMessage}</div> : null}
          <div className="button-row full-span">
            <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
              취소
            </button>
            <button type="submit" className="primary-button" disabled={update.isPending} data-testid="public-edit-save-button">
              <Save size={16} aria-hidden="true" />
              {update.isPending ? '저장 중...' : '수정 저장'}
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
