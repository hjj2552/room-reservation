import { X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ReservationStatus } from '../api/types';
import { errorMessage } from '../api/http';
import { statusLabels } from '../utils/labels';

export interface TimetableSlotSelection {
  source: 'slot' | 'toolbar';
  roomId: string;
  date: string;
  startAt: string;
  endAt: string;
}

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
  submitError?: unknown;
  isPending?: boolean;
  onClose: () => void;
  onSubmit: (values: ReservationRequestValues) => void;
}

function initialValues(selection: TimetableSlotSelection, variant: 'admin' | 'public'): ReservationRequestValues {
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
  submitError,
  isPending = false,
  onClose,
  onSubmit,
}: ReservationRequestPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [values, setValues] = useState<ReservationRequestValues>(() => initialValues(selection, variant));
  const [errors, setErrors] = useState<Partial<Record<keyof ReservationRequestValues, string>>>({});
  const ids = testIds[variant];
  const isAdmin = variant === 'admin';

  useEffect(() => {
    setValues(initialValues(selection, variant));
    setErrors({});
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [selection.date, selection.endAt, selection.roomId, selection.startAt, variant]);

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
    if (!values.roomId) nextErrors.roomId = '강의실을 선택해 주세요.';
    if (!values.applicantName) nextErrors.applicantName = '신청자 이름을 입력해 주세요.';
    if (!values.applicantEmail) nextErrors.applicantEmail = '이메일을 입력해 주세요.';
    if (!values.applicantPhone) nextErrors.applicantPhone = '전화번호를 입력해 주세요.';
    if (!values.purpose) nextErrors.purpose = '예약 목적을 입력해 주세요.';
    if (!values.startAt) nextErrors.startAt = '시작 시간을 입력해 주세요.';
    if (!values.endAt) nextErrors.endAt = '종료 시간을 입력해 주세요.';
    if (!isAdmin && (!values.cancelPassword || values.cancelPassword.length < 4)) {
      nextErrors.cancelPassword = '취소 비밀번호를 4자 이상 입력해 주세요.';
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
            {selection.source === 'slot' ? `${selection.date} 선택 슬롯` : `${selection.date} 새 신청`}
            {isAdmin ? ' · 관리자는 승인 상태로 저장할 수 있습니다.' : ' · 신청은 대기 상태로 접수됩니다.'}
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
          강의실
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
        {isAdmin ? (
          <label>
            저장 상태
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
            접수 상태
            <input value={statusLabels.REQUESTED} readOnly data-testid={ids.status} {...inputErrorProps('status')} />
            {fieldError('status')}
          </label>
        )}
        <label>
          시작
          <input
            data-testid={ids.start}
            type="datetime-local"
            value={values.startAt}
            onChange={(event) => updateField('startAt', event.target.value)}
            {...inputErrorProps('startAt')}
          />
          {fieldError('startAt')}
        </label>
        <label>
          종료
          <input
            data-testid={ids.end}
            type="datetime-local"
            value={values.endAt}
            onChange={(event) => updateField('endAt', event.target.value)}
            {...inputErrorProps('endAt')}
          />
          {fieldError('endAt')}
        </label>
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
            취소 비밀번호
            <input
              type="password"
              data-testid="public-request-cancel-password-input"
              value={values.cancelPassword}
              placeholder="4자리 이상"
              onChange={(event) => updateField('cancelPassword', event.target.value)}
              {...inputErrorProps('cancelPassword')}
            />
            {fieldError('cancelPassword')}
          </label>
        )}
        {submitError ? <div className="inline-error full-span" role="alert">{errorMessage(submitError)}</div> : null}
        <div className="button-row full-span request-form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button" data-testid={ids.submit} disabled={isPending}>
            {isPending ? '신청 중...' : isAdmin ? '예약 신청 저장' : '예약 신청'}
          </button>
        </div>
      </form>
    </aside>
  );
}
