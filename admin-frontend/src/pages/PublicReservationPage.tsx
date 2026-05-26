import { useQueries } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Send, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/http';
import { getPublicWeeklyReservations } from '../api/public';
import type { PublicReservationBlock, PublicReservationPayload, PublicRoom } from '../api/types';
import { ReservationDateTimetable, type TimetableReservation } from '../components/ReservationDateTimetable';
import { ReservationRoomTimetable } from '../components/ReservationRoomTimetable';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  publicReservationKeys,
  useCancelPublicReservation,
  useCreatePublicReservation,
  usePublicReservationDetail,
  usePublicRooms,
  usePublicSettings,
  usePublicWeeklyReservations,
} from '../hooks/usePublicReservation';
import { formatDateTime, fromDateTimeLocal } from '../utils/date';
import { statusLabels } from '../utils/labels';

type PublicTimetableViewMode = 'date' | 'room';

interface PublicSlotSelection {
  roomId: string;
  date: string;
  startAt: string;
  endAt: string;
}

interface QuickRequestValues {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
  cancelPassword: string;
}

const timetablePageSizeNote = '표시된 신청/예약은 대기 또는 확정 상태입니다.';
const publicStatusLabels = {
  REQUESTED: '신청 대기',
  CONFIRMED: '예약 확정',
  CANCELLED: '취소됨',
};

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysInputValue(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeekInputValue(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function minutesToTimeInput(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function slotToSelection(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
  return {
    roomId: slot.roomId,
    date: slot.date,
    startAt: `${slot.date}T${minutesToTimeInput(slot.startMinutes)}`,
    endAt: `${slot.date}T${minutesToTimeInput(slot.endMinutes)}`,
  };
}

function dateInKst(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function toTimetableReservation(reservation: PublicReservationBlock): TimetableReservation {
  return {
    id: reservation.id,
    roomId: reservation.roomId,
    roomName: reservation.roomName,
    applicantName: reservation.applicantName,
    purpose: reservation.purpose,
    startAt: reservation.startAt,
    endAt: reservation.endAt,
    status: reservation.status,
  };
}

function publicErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.body?.code === 'TIME_SLOT_CONFLICT') {
      return '이미 다른 신청 또는 예약이 있어 신청할 수 없습니다. 다른 강의실이나 시간을 선택해 주세요.';
    }
    if (error.body?.code === 'PUBLIC_CANCEL_PASSWORD_MISMATCH') {
      return '취소 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
    }
    if (error.body?.code === 'RESERVATION_DISABLED') {
      return '현재 예약 신청 접수가 중지되어 있습니다.';
    }
    if (error.status === 400) return '입력한 정보를 다시 확인해 주세요.';
    if (error.status === 422) return '운영 시간, 신청 가능 요일, 예약 가능 기간을 확인해 주세요.';
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function initialQuickValues(selection: PublicSlotSelection): QuickRequestValues {
  return {
    roomId: selection.roomId,
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    purpose: '',
    startAt: selection.startAt,
    endAt: selection.endAt,
    cancelPassword: '',
  };
}

export function PublicReservationPage() {
  const rooms = usePublicRooms();
  const settings = usePublicSettings();
  const create = useCreatePublicReservation();
  const [viewMode, setViewMode] = useState<PublicTimetableViewMode>('date');
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [quickSelection, setQuickSelection] = useState<PublicSlotSelection | null>(null);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  const activeRooms = rooms.data || [];
  const roomViewRoomId = activeRooms.some((room) => room.id === selectedRoomId)
    ? selectedRoomId
    : activeRooms[0]?.id || '';
  const selectedRoom = activeRooms.find((room) => room.id === roomViewRoomId);
  const selectedWeekStart = startOfWeekInputValue(selectedDate);
  const roomWeekly = usePublicWeeklyReservations(roomViewRoomId, selectedWeekStart);
  const dateWeeklyQueries = useQueries({
    queries: activeRooms.map((room) => ({
      queryKey: publicReservationKeys.weekly(room.id, selectedWeekStart),
      queryFn: () => getPublicWeeklyReservations(room.id, selectedWeekStart),
      enabled: viewMode === 'date',
    })),
  });

  useEffect(() => {
    if (!selectedRoomId && activeRooms[0]) setSelectedRoomId(activeRooms[0].id);
  }, [activeRooms, selectedRoomId]);

  useEffect(() => {
    if (!highlightedReservationId) return;
    const timer = window.setTimeout(() => setHighlightedReservationId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedReservationId]);

  const dateReservations = useMemo(
    () =>
      dateWeeklyQueries
        .flatMap((query) => query.data?.reservations || [])
        .filter((reservation) => dateInKst(reservation.startAt) === selectedDate)
        .map(toTimetableReservation),
    [dateWeeklyQueries, selectedDate],
  );
  const roomReservations = useMemo(
    () => (roomWeekly.data?.reservations || []).map(toTimetableReservation),
    [roomWeekly.data],
  );

  const isUnavailable = settings.data && !settings.data.reservationEnabled;
  const dateIsLoading = viewMode === 'date' && dateWeeklyQueries.some((query) => query.isLoading);
  const dateError = viewMode === 'date' ? dateWeeklyQueries.find((query) => query.isError)?.error : null;

  function handleSlotClick(slot: { date: string; startMinutes: number; endMinutes: number; roomId: string }) {
    if (isUnavailable) return;
    setQuickSelection(slotToSelection(slot));
  }

  function handleReservationClick(reservation: TimetableReservation) {
    setSelectedReservationId(reservation.id);
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div>
          <p className="eyebrow">{settings.data?.organizationName || '강의실 예약'}</p>
          <h1>예약 신청</h1>
          <p className="muted">시간표에서 빈 시간을 선택해 예약을 신청합니다. 신청은 즉시 확정되지 않습니다.</p>
        </div>
        <nav className="public-tabs" aria-label="공개 메뉴">
          <Link className="public-tab active" to="/public/reservations/new">
            <CalendarDays size={17} aria-hidden="true" />
            예약 신청
          </Link>
          <Link className="public-tab" to="/login">
            관리자
          </Link>
        </nav>
      </header>

      {rooms.isLoading || settings.isLoading ? <LoadingState /> : null}
      {rooms.isError ? <ErrorState error={rooms.error} /> : null}
      {settings.isError ? <ErrorState error={settings.error} /> : null}

      {settings.data ? (
        <section className="public-notice" aria-live="polite">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <strong>
              신청 가능 시간 {String(settings.data.openTime).slice(0, 5)}-
              {String(settings.data.closeTime).slice(0, 5)}
            </strong>
            <p>{timetablePageSizeNote}</p>
            {settings.data.publicNotice ? <p>{settings.data.publicNotice}</p> : null}
          </div>
        </section>
      ) : null}

      {isUnavailable ? (
        <div className="inline-error" role="alert">
          {settings.data?.reservationDisabledMessage || '현재 예약 신청 접수가 중지되어 있습니다.'}
        </div>
      ) : null}

      {rooms.data && settings.data ? (
        <section className="panel timetable-panel" aria-labelledby="public-timetable-title">
          <div className="panel-header">
            <div>
              <h2 id="public-timetable-title">예약 현황</h2>
              <p className="muted">빈 슬롯을 누르면 해당 날짜, 시간, 강의실로 예약 신청 패널이 열립니다.</p>
            </div>
            <div className="view-mode-bar" role="tablist" aria-label="시간표 보기 방식">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'date'}
                className={viewMode === 'date' ? 'view-mode-tab active' : 'view-mode-tab'}
                onClick={() => setViewMode('date')}
                data-testid="public-timetable-view-date"
              >
                <CalendarDays size={16} aria-hidden="true" />
                날짜별
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'room'}
                className={viewMode === 'room' ? 'view-mode-tab active' : 'view-mode-tab'}
                onClick={() => setViewMode('room')}
                data-testid="public-timetable-view-room"
              >
                <DoorOpen size={16} aria-hidden="true" />
                강의실별
              </button>
            </div>
          </div>

          {viewMode === 'date' ? (
            <>
              <div className="room-week-controls">
                <label className="compact-date-picker">
                  날짜
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    data-testid="public-timetable-date-input"
                  />
                </label>
              </div>
              {dateIsLoading ? <LoadingState /> : null}
              {dateError ? <ErrorState error={dateError} /> : null}
              <ReservationDateTimetable
                rooms={activeRooms}
                reservations={dateReservations}
                selectedDate={selectedDate}
                openTime={settings.data.openTime}
                closeTime={settings.data.closeTime}
                slotMinutes={settings.data.slotMinutes}
                highlightedReservationId={highlightedReservationId}
                onEmptySlotClick={handleSlotClick}
                onReservationClick={handleReservationClick}
                statusLabelOverride={publicStatusLabels}
              />
            </>
          ) : null}

          {viewMode === 'room' ? (
            <>
              <div className="room-week-controls">
                <label className="compact-room-picker">
                  강의실
                  <select
                    value={roomViewRoomId}
                    onChange={(event) => setSelectedRoomId(event.target.value)}
                    data-testid="public-timetable-room-select"
                  >
                    {activeRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="week-navigation">
                  <button
                    type="button"
                    className="secondary-button icon-button"
                    onClick={() => setSelectedDate(addDaysInputValue(selectedWeekStart, -7))}
                    aria-label="이전 주"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <label className="compact-date-picker">
                    주 시작일
                    <input
                      type="date"
                      value={selectedWeekStart}
                      onChange={(event) => setSelectedDate(event.target.value)}
                      data-testid="public-timetable-week-input"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button icon-button"
                    onClick={() => setSelectedDate(addDaysInputValue(selectedWeekStart, 7))}
                    aria-label="다음 주"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {roomWeekly.isLoading ? <LoadingState /> : null}
              {roomWeekly.isError ? <ErrorState error={roomWeekly.error} /> : null}
              <ReservationRoomTimetable
                room={selectedRoom}
                reservations={roomReservations}
                weekStart={selectedWeekStart}
                openTime={settings.data.openTime}
                closeTime={settings.data.closeTime}
                slotMinutes={settings.data.slotMinutes}
                highlightedReservationId={highlightedReservationId}
                onEmptySlotClick={handleSlotClick}
                onReservationClick={handleReservationClick}
                statusLabelOverride={publicStatusLabels}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {quickSelection ? (
        <PublicQuickRequestPanel
          rooms={activeRooms}
          selection={quickSelection}
          requirePhone={Boolean(settings.data?.requirePhone)}
          onClose={() => setQuickSelection(null)}
          onCreated={(reservationId) => {
            setHighlightedReservationId(reservationId);
            setQuickSelection(null);
          }}
        />
      ) : null}

      {selectedReservationId ? (
        <PublicReservationDetailModal
          reservationId={selectedReservationId}
          onClose={() => setSelectedReservationId(null)}
        />
      ) : null}
    </div>
  );
}

function PublicQuickRequestPanel({
  rooms,
  selection,
  requirePhone,
  onClose,
  onCreated,
}: {
  rooms: PublicRoom[];
  selection: PublicSlotSelection;
  requirePhone: boolean;
  onClose: () => void;
  onCreated: (reservationId: string) => void;
}) {
  const create = useCreatePublicReservation();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [values, setValues] = useState<QuickRequestValues>(() => initialQuickValues(selection));
  const [errors, setErrors] = useState<Partial<Record<keyof QuickRequestValues, string>>>({});

  useEffect(() => {
    setValues(initialQuickValues(selection));
    setErrors({});
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [selection.endAt, selection.roomId, selection.startAt]);

  function updateField<K extends keyof QuickRequestValues>(name: K, value: QuickRequestValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function validate() {
    const nextErrors: Partial<Record<keyof QuickRequestValues, string>> = {};
    if (!values.roomId) nextErrors.roomId = '강의실을 선택해 주세요.';
    if (!values.applicantName) nextErrors.applicantName = '신청자 이름을 입력해 주세요.';
    if (!values.applicantEmail) nextErrors.applicantEmail = '이메일을 입력해 주세요.';
    if (requirePhone && !values.applicantPhone) nextErrors.applicantPhone = '전화번호를 입력해 주세요.';
    if (!values.purpose) nextErrors.purpose = '사용 목적을 입력해 주세요.';
    if (!values.startAt) nextErrors.startAt = '시작 시간을 입력해 주세요.';
    if (!values.endAt) nextErrors.endAt = '종료 시간을 입력해 주세요.';
    if (!values.cancelPassword || values.cancelPassword.length < 4) {
      nextErrors.cancelPassword = '취소 비밀번호를 4자 이상 입력해 주세요.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function toPayload(): PublicReservationPayload {
    return {
      roomId: values.roomId,
      applicantName: values.applicantName,
      applicantEmail: values.applicantEmail,
      applicantPhone: values.applicantPhone || undefined,
      purpose: values.purpose,
      startAt: fromDateTimeLocal(values.startAt),
      endAt: fromDateTimeLocal(values.endAt),
      cancelPassword: values.cancelPassword,
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    create.mutate(toPayload(), {
      onSuccess: (created) => onCreated(created.id),
    });
  }

  return (
    <aside className="quick-add-panel" aria-labelledby="public-quick-request-title" data-testid="public-quick-request-panel">
      <div className="quick-add-header">
        <div>
          <p className="eyebrow">빠른 예약 신청</p>
          <h2 id="public-quick-request-title">예약 신청</h2>
          <p className="muted">{selection.date} 선택 슬롯</p>
        </div>
        <button
          type="button"
          className="ghost-button icon-button"
          onClick={onClose}
          ref={closeButtonRef}
          aria-label="예약 신청 패널 닫기"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <form className="quick-add-form" onSubmit={onSubmit}>
        <label>
          강의실
          <select
            value={values.roomId}
            onChange={(event) => updateField('roomId', event.target.value)}
            data-testid="public-request-room-select"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          {errors.roomId ? <span className="field-error">{errors.roomId}</span> : null}
        </label>
        <label>
          시작 시간
          <input
            type="datetime-local"
            value={values.startAt}
            onChange={(event) => updateField('startAt', event.target.value)}
            data-testid="public-request-start-input"
          />
          {errors.startAt ? <span className="field-error">{errors.startAt}</span> : null}
        </label>
        <label>
          종료 시간
          <input
            type="datetime-local"
            value={values.endAt}
            onChange={(event) => updateField('endAt', event.target.value)}
            data-testid="public-request-end-input"
          />
          {errors.endAt ? <span className="field-error">{errors.endAt}</span> : null}
        </label>
        <label>
          신청자 이름
          <input
            value={values.applicantName}
            onChange={(event) => updateField('applicantName', event.target.value)}
            data-testid="public-request-applicant-name-input"
          />
          {errors.applicantName ? <span className="field-error">{errors.applicantName}</span> : null}
        </label>
        <label>
          이메일
          <input
            type="email"
            value={values.applicantEmail}
            onChange={(event) => updateField('applicantEmail', event.target.value)}
            data-testid="public-request-email-input"
          />
          {errors.applicantEmail ? <span className="field-error">{errors.applicantEmail}</span> : null}
        </label>
        <label>
          전화번호{requirePhone ? '' : ' (선택)'}
          <input
            value={values.applicantPhone}
            onChange={(event) => updateField('applicantPhone', event.target.value)}
            data-testid="public-request-phone-input"
          />
          {errors.applicantPhone ? <span className="field-error">{errors.applicantPhone}</span> : null}
        </label>
        <label className="full-span">
          사용 목적
          <input
            value={values.purpose}
            onChange={(event) => updateField('purpose', event.target.value)}
            data-testid="public-request-purpose-input"
          />
          {errors.purpose ? <span className="field-error">{errors.purpose}</span> : null}
        </label>
        <label className="full-span">
          취소 비밀번호
          <input
            type="password"
            value={values.cancelPassword}
            onChange={(event) => updateField('cancelPassword', event.target.value)}
            data-testid="public-request-cancel-password-input"
          />
          <span className="muted">나중에 이 신청을 취소할 때 필요합니다.</span>
          {errors.cancelPassword ? <span className="field-error">{errors.cancelPassword}</span> : null}
        </label>
        {create.isError ? <div className="inline-error full-span" role="alert">{publicErrorMessage(create.error)}</div> : null}
        {create.isSuccess ? (
          <div className="success-box full-span" role="status">
            예약 신청이 접수되었습니다. 상태: 신청 대기
          </div>
        ) : null}
        <div className="button-row full-span">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button" disabled={create.isPending} data-testid="public-request-submit-button">
            <Send size={16} aria-hidden="true" />
            {create.isPending ? '신청 접수 중' : '예약 신청'}
          </button>
        </div>
      </form>
    </aside>
  );
}

function PublicReservationDetailModal({ reservationId, onClose }: { reservationId: string; onClose: () => void }) {
  const detail = usePublicReservationDetail(reservationId);
  const cancel = useCancelPublicReservation(reservationId);
  const [cancelPassword, setCancelPassword] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  function onCancelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancel.mutate(cancelPassword);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="public-reservation-detail-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">예약 신청 상세</p>
            <h2 id="public-reservation-detail-title">상세 정보</h2>
          </div>
          <button type="button" className="ghost-button icon-button" onClick={onClose} aria-label="상세 닫기">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {detail.isLoading ? <LoadingState /> : null}
        {detail.isError ? <ErrorState error={detail.error} /> : null}
        {detail.data ? (
          <>
            <dl className="description-list">
              <div>
                <dt>상태</dt>
                <dd>{publicStatusLabels[detail.data.status]}</dd>
              </div>
              <div>
                <dt>강의실</dt>
                <dd>{detail.data.room.name}</dd>
              </div>
              <div>
                <dt>시간</dt>
                <dd>{formatDateTime(detail.data.startAt)} - {formatDateTime(detail.data.endAt)}</dd>
              </div>
              <div>
                <dt>신청자</dt>
                <dd>{detail.data.applicantName}</dd>
              </div>
              <div>
                <dt>용도</dt>
                <dd>{detail.data.purpose}</dd>
              </div>
              <div>
                <dt>취소 가능</dt>
                <dd>{detail.data.cancellable ? '가능' : '불가'}</dd>
              </div>
            </dl>

            {detail.data.cancellable ? (
              <div className="modal-actions">
                {!showCancelForm ? (
                  <button type="button" className="danger-button" onClick={() => setShowCancelForm(true)}>
                    예약 신청 취소
                  </button>
                ) : null}
              </div>
            ) : null}

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
                {cancel.isSuccess ? <div className="success-box" role="status">예약 신청이 취소되었습니다.</div> : null}
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
          </>
        ) : null}
      </section>
    </div>
  );
}
