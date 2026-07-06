import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import type { ReservationDetail, ReservationPayload, ReservationStatus } from '../../shared/api/types';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCreateReservation,
  useReservation,
  useUpdateReservation,
} from '../../shared/hooks/useReservations';
import { useRooms } from '../../shared/hooks/useRooms';
import { fromDateTimeLocal, toDateTimeLocal } from '../../shared/utils/date';
import { statusLabels } from '../../shared/utils/labels';

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

interface DuplicateReservationState {
  duplicateSource?: ReservationDetail;
}

const defaultReservationFormValues: ReservationFormValues = {
  roomId: '',
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  purpose: '',
  startAt: '',
  endAt: '',
  status: 'CONFIRMED',
  memo: '',
};

const duplicateExcludedFields = new Set([
  'startAt',
  'endAt',
  'memo',
  'recurrenceId',
  'recurrenceException',
  'series',
  'seriesId',
  'seriesLabel',
  'seriesColor',
  'tagId',
  'tagName',
  'tagColor',
]);

export function ReservationFormPage({ mode }: ReservationFormPageProps) {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const duplicateSource = (location.state as DuplicateReservationState | null)?.duplicateSource;
  const rooms = useRooms();
  const duplicatePrefilledRef = useRef(false);
  const reservation = useReservation(mode === 'edit' ? reservationId : undefined);
  const create = useCreateReservation();
  const update = useUpdateReservation(reservationId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReservationFormValues>({
    defaultValues: defaultReservationFormValues,
  });

  useEffect(() => {
    if (mode === 'create' && duplicateSource) {
      if (duplicatePrefilledRef.current) {
        return;
      }
      const sourceRoomLoaded = rooms.data?.items.some((room) => room.id === duplicateSource.room.id);
      if (!sourceRoomLoaded) {
        return;
      }
      reset(prefillDuplicateReservationFormValues(defaultReservationFormValues, duplicateSource));
      duplicatePrefilledRef.current = true;
      return;
    }
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
  }, [duplicateSource, mode, reservation.data, reset, rooms.data]);

  function toPayload(values: ReservationFormValues): ReservationPayload {
    return {
      roomId: values.roomId,
      applicantName: values.applicantName,
      applicantEmail: values.applicantEmail,
      applicantPhone: values.applicantPhone,
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
        onSuccess: (created) => navigate(`/admin/reservations/${created.id}`),
      });
      return;
    }
    update.mutate(payload, {
      onSuccess: (updated) => navigate(`/admin/reservations/${updated.id}`),
    });
  }

  if (mode === 'edit' && reservation.isLoading) return <LoadingState />;
  if (mode === 'edit' && reservation.isError) return <ErrorState error={reservation.error} />;

  const mutationError = create.error || update.error;
  const isPending = create.isPending || update.isPending;

  return (
    <section className="page-section" aria-labelledby="reservation-form-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="reservation-form-title">{mode === 'create' ? '예약 신청' : '예약 수정'}</h1>
          <p className="muted">
            {mode === 'edit'
              ? '운영자가 예약 정보를 수정합니다. 예약 시간을 바꾸거나 취소된 예약을 다시 활성화하는 경우에는 시간 충돌을 재검사합니다.'
              : '운영자가 직접 예약 정보를 입력하고 저장합니다.'}
          </p>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <label>
          강의실
          <select data-testid="reservation-room-select" {...register('roomId', { required: '강의실을 선택하세요.' })}>
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
          <select data-testid="reservation-status-select" {...register('status', { required: true })}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          신청자 이름
          <input
            data-testid="reservation-applicant-name-input"
            {...register('applicantName', { required: '신청자 이름을 입력하세요.' })}
          />
          {errors.applicantName ? <span className="field-error">{errors.applicantName.message}</span> : null}
        </label>
        <label>
          이메일
          <input
            data-testid="reservation-email-input"
            type="email"
            {...register('applicantEmail', { required: '이메일을 입력하세요.' })}
          />
          {errors.applicantEmail ? <span className="field-error">{errors.applicantEmail.message}</span> : null}
        </label>
        <label>
          전화번호
          <input
            data-testid="reservation-phone-input"
            placeholder="- 제외하고 입력"
            {...register('applicantPhone', { required: '전화번호를 입력하세요.' })}
          />
          {errors.applicantPhone ? <span className="field-error">{errors.applicantPhone.message}</span> : null}
        </label>
        <label>
          예약 목적
          <input
            data-testid="reservation-purpose-input"
            {...register('purpose', { required: '예약 목적을 입력하세요.' })}
          />
          {errors.purpose ? <span className="field-error">{errors.purpose.message}</span> : null}
        </label>
        <label>
          시작 시간
          <input
            data-testid="reservation-start-input"
            type="datetime-local"
            {...register('startAt', { required: '시작 시간을 입력하세요.' })}
          />
          {errors.startAt ? <span className="field-error">{errors.startAt.message}</span> : null}
        </label>
        <label>
          종료 시간
          <input
            data-testid="reservation-end-input"
            type="datetime-local"
            {...register('endAt', { required: '종료 시간을 입력하세요.' })}
          />
          {errors.endAt ? <span className="field-error">{errors.endAt.message}</span> : null}
        </label>
        <label className="full-span">
          처리 메모
          <textarea
            data-testid="reservation-memo-input"
            rows={4}
            {...register('memo')}
            placeholder="신청 또는 수정 사유를 남깁니다."
          />
        </label>
        {mutationError ? <div className="inline-error full-span" role="alert">{errorMessage(mutationError)}</div> : null}
        <div className="button-row full-span">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            취소
          </button>
          <button
            type="submit"
            className="primary-button"
            data-testid="reservation-save-button"
            disabled={isPending}
          >
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </section>
  );
}

function prefillDuplicateReservationFormValues(
  defaults: ReservationFormValues,
  source: ReservationDetail,
): ReservationFormValues {
  const sourceRecord = source as unknown as Record<string, unknown>;
  return (Object.keys(defaults) as Array<keyof ReservationFormValues>).reduce<ReservationFormValues>(
    (values, key) => {
      if (duplicateExcludedFields.has(key)) {
        return values;
      }

      if (key === 'roomId') {
        return { ...values, roomId: source.room.id };
      }

      if (key in sourceRecord) {
        const value = sourceRecord[key];
        if (typeof value === 'string') {
          return { ...values, [key]: value };
        }
        if (value === null) {
          return { ...values, [key]: '' };
        }
      }

      return values;
    },
    { ...defaults },
  );
}
