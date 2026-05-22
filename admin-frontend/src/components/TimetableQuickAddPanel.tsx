import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { AdminRoom, ReservationPayload, ReservationStatus } from '../api/types';
import { errorMessage } from '../api/http';
import { useCreateReservation } from '../hooks/useReservations';
import { fromDateTimeLocal } from '../utils/date';
import { statusLabels } from '../utils/labels';

export interface TimetableSlotSelection {
  roomId: string;
  date: string;
  startAt: string;
  endAt: string;
}

interface TimetableQuickAddPanelProps {
  rooms: AdminRoom[];
  selection: TimetableSlotSelection;
  onClose: () => void;
  onCreated: (reservationId: string) => void;
}

interface QuickAddFormValues {
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

export function TimetableQuickAddPanel({ rooms, selection, onClose, onCreated }: TimetableQuickAddPanelProps) {
  const create = useCreateReservation();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuickAddFormValues>({
    defaultValues: {
      roomId: selection.roomId,
      applicantName: '',
      applicantEmail: '',
      applicantPhone: '',
      purpose: '',
      startAt: selection.startAt,
      endAt: selection.endAt,
      status: 'CONFIRMED',
      memo: '',
    },
  });

  useEffect(() => {
    reset({
      roomId: selection.roomId,
      applicantName: '',
      applicantEmail: '',
      applicantPhone: '',
      purpose: '',
      startAt: selection.startAt,
      endAt: selection.endAt,
      status: 'CONFIRMED',
      memo: '',
    });
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [reset, selection]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function toPayload(values: QuickAddFormValues): ReservationPayload {
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

  function onSubmit(values: QuickAddFormValues) {
    create.mutate(toPayload(values), {
      onSuccess: (created) => onCreated(created.id),
    });
  }

  return (
    <aside className="quick-add-panel" aria-labelledby="quick-add-title" data-testid="timetable-quick-add-panel">
      <div className="quick-add-header">
        <div>
          <p className="eyebrow">시간표 등록</p>
          <h2 id="quick-add-title">예약 빠른 등록</h2>
          <p className="muted">{selection.date} 선택 슬롯</p>
        </div>
        <button
          type="button"
          className="ghost-button icon-button"
          onClick={onClose}
          ref={closeButtonRef}
          aria-label="예약 등록 패널 닫기"
          data-testid="timetable-quick-add-close"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <form className="quick-add-form" onSubmit={handleSubmit(onSubmit)}>
        <label>
          강의실
          <select
            data-testid="quick-add-room-select"
            {...register('roomId', { required: '강의실을 선택하세요.' })}
          >
            <option value="">선택</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {errors.roomId ? <span className="field-error">{errors.roomId.message}</span> : null}
        </label>
        <label>
          상태
          <select data-testid="quick-add-status-select" {...register('status', { required: true })}>
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
            data-testid="quick-add-applicant-name-input"
            {...register('applicantName', { required: '신청자 이름을 입력하세요.' })}
          />
          {errors.applicantName ? <span className="field-error">{errors.applicantName.message}</span> : null}
        </label>
        <label>
          이메일
          <input
            data-testid="quick-add-email-input"
            type="email"
            {...register('applicantEmail', { required: '이메일을 입력하세요.' })}
          />
          {errors.applicantEmail ? <span className="field-error">{errors.applicantEmail.message}</span> : null}
        </label>
        <label>
          전화번호
          <input data-testid="quick-add-phone-input" {...register('applicantPhone')} />
        </label>
        <label>
          예약 목적
          <input
            data-testid="quick-add-purpose-input"
            {...register('purpose', { required: '예약 목적을 입력하세요.' })}
          />
          {errors.purpose ? <span className="field-error">{errors.purpose.message}</span> : null}
        </label>
        <label>
          시작 시간
          <input
            data-testid="quick-add-start-input"
            type="datetime-local"
            {...register('startAt', { required: '시작 시간을 입력하세요.' })}
          />
          {errors.startAt ? <span className="field-error">{errors.startAt.message}</span> : null}
        </label>
        <label>
          종료 시간
          <input
            data-testid="quick-add-end-input"
            type="datetime-local"
            {...register('endAt', { required: '종료 시간을 입력하세요.' })}
          />
          {errors.endAt ? <span className="field-error">{errors.endAt.message}</span> : null}
        </label>
        <label className="full-span">
          처리 메모
          <textarea data-testid="quick-add-memo-input" rows={3} {...register('memo')} />
        </label>
        {create.isError ? <div className="inline-error full-span" role="alert">{errorMessage(create.error)}</div> : null}
        <div className="button-row full-span">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button" data-testid="quick-add-save-button" disabled={create.isPending}>
            {create.isPending ? '저장 중...' : '예약 등록'}
          </button>
        </div>
      </form>
    </aside>
  );
}
