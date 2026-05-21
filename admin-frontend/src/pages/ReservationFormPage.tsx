import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/http';
import type { ReservationPayload, ReservationStatus } from '../api/types';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  useCreateReservation,
  useReservation,
  useUpdateReservation,
} from '../hooks/useReservations';
import { useRooms } from '../hooks/useRooms';
import { fromDateTimeLocal, toDateTimeLocal } from '../utils/date';
import { statusLabels } from '../utils/labels';

interface ReservationFormPageProps {
  mode: 'create' | 'edit';
}

interface ReservationFormValues {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  memo: string;
}

export function ReservationFormPage({ mode }: ReservationFormPageProps) {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const rooms = useRooms();
  const reservation = useReservation(mode === 'edit' ? reservationId : undefined);
  const create = useCreateReservation();
  const update = useUpdateReservation(reservationId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReservationFormValues>({
    defaultValues: {
      roomId: '',
      applicantName: '',
      applicantEmail: '',
      applicantPhone: '',
      purpose: '',
      startAt: '',
      endAt: '',
      status: 'CONFIRMED',
      memo: '',
    },
  });

  useEffect(() => {
    if (mode === 'edit' && reservation.data) {
      reset({
        roomId: reservation.data.room.id,
        applicantName: reservation.data.applicantName,
        applicantEmail: reservation.data.applicantEmail,
        applicantPhone: reservation.data.applicantPhone || '',
        purpose: reservation.data.purpose,
        startAt: toDateTimeLocal(reservation.data.startAt),
        endAt: toDateTimeLocal(reservation.data.endAt),
        status: reservation.data.status,
        memo: '',
      });
    }
  }, [mode, reservation.data, reset]);

  function toPayload(values: ReservationFormValues): ReservationPayload {
    return {
      roomId: values.roomId,
      applicantName: values.applicantName,
      applicantEmail: values.applicantEmail,
      applicantPhone: values.applicantPhone || undefined,
      purpose: values.purpose,
      startAt: fromDateTimeLocal(values.startAt),
      endAt: fromDateTimeLocal(values.endAt),
      status: values.status,
      memo: values.memo || undefined,
    };
  }

  function onSubmit(values: ReservationFormValues) {
    const payload = toPayload(values);
    if (mode === 'create') {
      create.mutate(payload, {
        onSuccess: (created) => navigate(`/reservations/${created.id}`),
      });
      return;
    }
    update.mutate(payload, {
      onSuccess: (updated) => navigate(`/reservations/${updated.id}`),
    });
  }

  if (mode === 'edit' && reservation.isLoading) return <LoadingState />;
  if (mode === 'edit' && reservation.isError) return <ErrorState error={reservation.error} />;

  const mutationError = create.error || update.error;
  const isPending = create.isPending || update.isPending;

  return (
    <section className="page-section narrow" aria-labelledby="reservation-form-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">예약 운영</p>
          <h1 id="reservation-form-title">{mode === 'create' ? '예약 등록' : '예약 수정'}</h1>
          <p className="muted">운영자가 직접 예약 정보를 입력하고 저장합니다.</p>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <label>
          강의실
          <select {...register('roomId', { required: '강의실을 선택하세요.' })}>
            <option value="">선택</option>
            {rooms.data?.items.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {errors.roomId ? <span className="field-error">{errors.roomId.message}</span> : null}
        </label>
        <label>
          상태
          <select {...register('status', { required: true })}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          신청자 이름
          <input {...register('applicantName', { required: '신청자 이름을 입력하세요.' })} />
          {errors.applicantName ? <span className="field-error">{errors.applicantName.message}</span> : null}
        </label>
        <label>
          이메일
          <input
            type="email"
            {...register('applicantEmail', { required: '이메일을 입력하세요.' })}
          />
          {errors.applicantEmail ? <span className="field-error">{errors.applicantEmail.message}</span> : null}
        </label>
        <label>
          전화번호
          <input {...register('applicantPhone')} />
        </label>
        <label>
          예약 목적
          <input {...register('purpose', { required: '예약 목적을 입력하세요.' })} />
          {errors.purpose ? <span className="field-error">{errors.purpose.message}</span> : null}
        </label>
        <label>
          시작 시간
          <input
            type="datetime-local"
            {...register('startAt', { required: '시작 시간을 입력하세요.' })}
          />
          {errors.startAt ? <span className="field-error">{errors.startAt.message}</span> : null}
        </label>
        <label>
          종료 시간
          <input
            type="datetime-local"
            {...register('endAt', { required: '종료 시간을 입력하세요.' })}
          />
          {errors.endAt ? <span className="field-error">{errors.endAt.message}</span> : null}
        </label>
        <label className="full-span">
          처리 메모
          <textarea rows={4} {...register('memo')} placeholder="생성 또는 수정 사유를 남깁니다." />
        </label>
        {mutationError ? <div className="inline-error full-span" role="alert">{errorMessage(mutationError)}</div> : null}
        <div className="button-row full-span">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            취소
          </button>
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </section>
  );
}
