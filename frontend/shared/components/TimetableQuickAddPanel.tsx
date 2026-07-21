import { X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ReservationDetail, ReservationStatus } from '../api/types';
import { errorMessage } from '../api/http';
import { statusLabels } from '../utils/labels';
import {
  acceptsPublicPasswordInput,
  publicPasswordBlockedMessage,
  publicPasswordHelp,
  publicPasswordPattern,
} from '../utils/publicPassword';
import type { ReservationTimeSelection } from '../utils/reservationTime';
import { ReservationTimeRangeInput } from './ReservationTimeRangeInput';

export type TimetableSlotSelection = ReservationTimeSelection;

export interface ReservationRequestValues {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  memo: string;
  cancelPassword: string;
}

interface RequestRoom {
  id: string;
  name: string;
}

interface ReservationRequestPanelProps {
  variant: 'admin' | 'public';
  rooms: RequestRoom[];
  selection: TimetableSlotSelection;
  openTime: string;
  closeTime: string;
  minReservationMinutes: number;
  maxReservationMinutes: number;
  initialValues?: ReservationRequestValues;
  unavailableMessage?: string;
  submitError?: unknown;
  isPending?: boolean;
  onClose: () => void;
  onSubmit: (values: ReservationRequestValues) => void;
}

const duplicateExcludedFields = new Set([
  'startAt',
  'endAt',
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

export function initialReservationRequestValues(
  selection: TimetableSlotSelection,
  variant: 'admin' | 'public',
): ReservationRequestValues {
  return {
    roomId: selection.roomId,
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    purpose: '',
    startAt: selection.startAt,
    endAt: selection.endAt,
    status: variant === 'admin' ? 'CONFIRMED' : 'REQUESTED',
    memo: '',
    cancelPassword: '',
  };
}

export function duplicateReservationRequestValues(
  defaults: ReservationRequestValues,
  source: ReservationDetail,
): ReservationRequestValues {
  const sourceRecord = source as unknown as Record<string, unknown>;
  return (Object.keys(defaults) as Array<keyof ReservationRequestValues>).reduce<ReservationRequestValues>(
    (values, key) => {
      if (duplicateExcludedFields.has(key)) {
        return values;
      }

      if (key === 'roomId') {
        return { ...values, roomId: source.room.id };
      }

      if (key in sourceRecord) {
        const value = sourceRecord[key];
        if (value === null && typeof defaults[key] === 'string') {
          return { ...values, [key]: '' };
        }
        if (typeof value === typeof defaults[key]) {
          return { ...values, [key]: value };
        }
      }

      return values;
    },
    { ...defaults },
  );
}

const testIds = {
  admin: {
    panel: 'timetable-quick-add-panel',
    close: 'timetable-quick-add-close',
    room: 'quick-add-room-select',
    status: 'quick-add-status-select',
    applicantName: 'quick-add-applicant-name-input',
    email: 'quick-add-email-input',
    phone: 'quick-add-phone-input',
    purpose: 'quick-add-purpose-input',
    start: 'quick-add-start-input',
    end: 'quick-add-end-input',
    memo: 'quick-add-memo-input',
    submit: 'quick-add-save-button',
  },
  public: {
    panel: 'public-quick-request-panel',
    close: 'public-quick-request-close',
    room: 'public-request-room-select',
    status: 'public-request-status-select',
    applicantName: 'public-request-applicant-name-input',
    email: 'public-request-email-input',
    phone: 'public-request-phone-input',
    purpose: 'public-request-purpose-input',
    start: 'public-request-start-input',
    end: 'public-request-end-input',
    memo: 'public-request-memo-input',
    submit: 'public-request-submit-button',
  },
};

export function ReservationRequestPanel({
  variant,
  rooms,
  selection,
  openTime,
  closeTime,
  minReservationMinutes,
  maxReservationMinutes,
  initialValues,
  unavailableMessage,
  submitError,
  isPending = false,
  onClose,
  onSubmit,
}: ReservationRequestPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [values, setValues] = useState<ReservationRequestValues>(
    () => initialValues ?? initialReservationRequestValues(selection, variant),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ReservationRequestValues, string>>>({});
  const ids = testIds[variant];
  const isAdmin = variant === 'admin';

  useEffect(() => {
    setValues(initialValues ?? initialReservationRequestValues(selection, variant));
    setErrors({});
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [initialValues, selection.date, selection.endAt, selection.roomId, selection.startAt, variant]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function updateField<K extends keyof ReservationRequestValues>(name: K, value: ReservationRequestValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function validate() {
    const nextErrors: Partial<Record<keyof ReservationRequestValues, string>> = {};
    if (!values.roomId) nextErrors.roomId = '예약 공간을 선택해 주세요.';
    if (!values.applicantName) nextErrors.applicantName = '신청자 이름을 입력해 주세요.';
    if (!values.applicantEmail) nextErrors.applicantEmail = '이메일을 입력해 주세요.';
    if (!values.applicantPhone) nextErrors.applicantPhone = '전화번호를 입력해 주세요.';
    if (!values.purpose) nextErrors.purpose = '신청 목적을 입력해 주세요.';
    if (!values.startAt) nextErrors.startAt = '시작 시간을 입력해 주세요.';
    if (!values.endAt) nextErrors.endAt = '종료 시간을 입력해 주세요.';
    if (!isAdmin && !publicPasswordPattern.test(values.cancelPassword)) {
      nextErrors.cancelPassword = publicPasswordHelp;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit(values);
  }

  function errorId(name: keyof ReservationRequestValues) {
    return `${ids.panel}-${name}-error`;
  }

  function inputErrorProps(name: keyof ReservationRequestValues) {
    const hasError = Boolean(errors[name]);
    return {
      'aria-invalid': hasError || undefined,
      'aria-describedby': errorId(name),
    };
  }

  function fieldError(name: keyof ReservationRequestValues) {
    return (
      <span id={errorId(name)} className="field-error" role={errors[name] ? 'alert' : undefined}>
        {errors[name] || ''}
      </span>
    );
  }

  const submitErrorMessage = submitError ? errorMessage(submitError) : '';

  return (
    <aside
      className="quick-add-panel reservation-request-panel"
      aria-labelledby="reservation-request-title"
      data-testid={ids.panel}
    >
      <div className="quick-add-header">
        <div>
          <h2 id="reservation-request-title">예약 신청</h2>
          <p className="muted">
            {selection.source === 'slot'
              ? `${selection.date} 선택 슬롯`
              : selection.date
                ? `${selection.date} 새 신청`
                : '예약 가능한 미래 시간 없음'}
            {isAdmin
              ? ' · 관리자는 예약을 승인 상태로 저장할 수 있으며, 과거 시간대의 예약도 등록할 수 있습니다.'
              : ' · 신청은 승인 대기 상태로 저장됩니다.'}
          </p>
        </div>
        <button
          type="button"
          className="ghost-button icon-button"
          onClick={onClose}
          ref={closeButtonRef}
          aria-label="예약 신청 패널 닫기"
          data-testid={ids.close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {unavailableMessage ? (
        <div className="inline-error" role="alert" data-testid="reservation-time-unavailable">
          {unavailableMessage}
        </div>
      ) : null}

      <form className="quick-add-form compact-request-form" onSubmit={handleSubmit}>
        <label className="full-span request-title-field">
          신청 목적
          <input
            data-testid={ids.purpose}
            value={values.purpose}
            placeholder="예: 세미나, 보강, 회의"
            onChange={(event) => updateField('purpose', event.target.value)}
            {...inputErrorProps('purpose')}
          />
          {fieldError('purpose')}
        </label>
        <label>
          예약 공간
          <select
            data-testid={ids.room}
            value={values.roomId}
            onChange={(event) => updateField('roomId', event.target.value)}
            {...inputErrorProps('roomId')}
          >
            <option value="">선택</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {fieldError('roomId')}
        </label>
        <ReservationTimeRangeInput
          key={`${selection.source}-${selection.date}-${selection.startAt}-${selection.endAt}`}
          startAt={values.startAt}
          endAt={values.endAt}
          openTime={openTime}
          closeTime={closeTime}
          minReservationMinutes={minReservationMinutes}
          maxReservationMinutes={maxReservationMinutes}
          onStartAtChange={(value) => updateField('startAt', value)}
          onEndAtChange={(value) => updateField('endAt', value)}
          dateTestId={`${ids.start}-date`}
          startTestId={ids.start}
          endTestId={ids.end}
          startInvalid={Boolean(errors.startAt)}
          endInvalid={Boolean(errors.endAt)}
          startDescribedBy={errorId('startAt')}
          endDescribedBy={errorId('endAt')}
          startError={fieldError('startAt')}
          endError={fieldError('endAt')}
        />
        <label>
          신청자
          <input
            data-testid={ids.applicantName}
            value={values.applicantName}
            onChange={(event) => updateField('applicantName', event.target.value)}
            {...inputErrorProps('applicantName')}
          />
          {fieldError('applicantName')}
        </label>
        <label>
          이메일
          <input
            data-testid={ids.email}
            type="email"
            value={values.applicantEmail}
            onChange={(event) => updateField('applicantEmail', event.target.value)}
            {...inputErrorProps('applicantEmail')}
          />
          {fieldError('applicantEmail')}
        </label>
        <label>
          전화번호
          <input
            data-testid={ids.phone}
            value={values.applicantPhone}
            placeholder="- 제외하고 입력"
            onChange={(event) => updateField('applicantPhone', event.target.value)}
            {...inputErrorProps('applicantPhone')}
          />
          {fieldError('applicantPhone')}
        </label>
        {isAdmin ? (
          <label>
            예약 상태
            <select
              data-testid={ids.status}
              value={values.status}
              onChange={(event) => updateField('status', event.target.value as ReservationStatus)}
              {...inputErrorProps('status')}
            >
              {(['CONFIRMED', 'REQUESTED'] as ReservationStatus[]).map((value) => (
                <option key={value} value={value}>
                  {value === 'CONFIRMED' ? '승인으로 저장' : statusLabels[value]}
                </option>
              ))}
            </select>
            {fieldError('status')}
          </label>
        ) : (
          <label>
            예약 상태
            <input value={statusLabels.REQUESTED} readOnly data-testid={ids.status} {...inputErrorProps('status')} />
            {fieldError('status')}
          </label>
        )}
        {isAdmin ? (
          <label>
            처리 메모
            <input
              data-testid={ids.memo}
              value={values.memo}
              onChange={(event) => updateField('memo', event.target.value)}
              {...inputErrorProps('memo')}
            />
            {fieldError('memo')}
          </label>
        ) : (
          <label>
            예약 비밀번호
            <input
              type="password"
              data-testid="public-request-cancel-password-input"
              value={values.cancelPassword}
              minLength={4}
              maxLength={64}
              pattern="[\x21-\x7E]{4,64}"
              placeholder="영문·숫자·특수문자 4~64자"
              onChange={(event) => {
                if (!acceptsPublicPasswordInput(event.target.value)) {
                  setErrors((current) => ({ ...current, cancelPassword: publicPasswordBlockedMessage }));
                  return;
                }
                updateField('cancelPassword', event.target.value);
              }}
              {...inputErrorProps('cancelPassword')}
            />
            <span className="field-help">{publicPasswordHelp}</span>
            {fieldError('cancelPassword')}
          </label>
        )}
        <div
          className="inline-error quick-add-submit-error full-span"
          role={submitError ? 'alert' : undefined}
          aria-hidden={submitError ? undefined : true}
        >
          {submitErrorMessage}
        </div>
        <div className="button-row full-span request-form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button
            type="submit"
            className="primary-button"
            data-testid={ids.submit}
            disabled={isPending || Boolean(unavailableMessage)}
          >
            {isPending ? '신청 중...' : isAdmin ? '예약 신청 저장' : '예약 신청'}
          </button>
        </div>
      </form>
    </aside>
  );
}
