import { CalendarDays, Check, Copy, PenLine, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReservationHistory } from '../../shared/api/types';
import { ApiError, errorMessage } from '../../shared/api/http';
import { ReservationDetailView, reservationCoreSections } from '../../shared/components/ReservationDetailView';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useDeleteReservation,
  useReservation,
  useReservationAction,
  useReservationHistories,
} from '../../shared/hooks/useReservations';
import { formatDateTime } from '../../shared/utils/date';
import { historyActionLabel, statusLabels } from '../../shared/utils/labels';
import { timetableDuplicateReservationUrl, timetableReservationUrl } from '../../shared/utils/timetable';

export function ReservationDetailPage() {
  const { reservationId = '' } = useParams();
  const navigate = useNavigate();
  const reservation = useReservation(reservationId);
  const histories = useReservationHistories(reservationId, { enabled: Boolean(reservation.data) });
  const approve = useReservationAction(reservationId, 'approve');
  const cancel = useReservationAction(reservationId, 'cancel');
  const deleteReservation = useDeleteReservation(reservationId);
  const [memo, setMemo] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function performAction(action: 'approve' | 'cancel') {
    const mutation = action === 'approve' ? approve : cancel;
    mutation.mutate(memo || undefined, {
      onSuccess: () => setMemo(''),
    });
  }

  function performDelete() {
    deleteReservation.mutate(memo || undefined, {
      onSuccess: () => {
        setShowDeleteModal(false);
        navigate(`/admin/audit?reservationId=${reservationId}&action=DELETED`);
      },
    });
  }

  if (reservation.isLoading) return <LoadingState />;
  if (reservation.isError && isReservationNotFound(reservation.error)) {
    return <DeletedReservationState reservationId={reservationId} />;
  }
  if (reservation.isError) return <ErrorState error={reservation.error} />;
  if (!reservation.data) return null;

  const detail = reservation.data;
  const isCancelled = detail.status === 'CANCELLED';
  const coreSections = reservationCoreSections({
    room: detail.room,
    startAt: detail.startAt,
    endAt: detail.endAt,
    applicantName: detail.applicantName,
    applicantEmail: detail.applicantEmail,
    applicantPhone: detail.applicantPhone,
    purpose: <span data-testid="reservation-purpose">{detail.purpose}</span>,
  });
  if (detail.series) {
    coreSections.push({
      title: '반복 예약',
      fields: [
        {
          label: '태그',
          value: detail.series.label ? (
            <span
              className="series-chip"
              style={detail.series.color ? { borderColor: detail.series.color, color: detail.series.color } : undefined}
            >
              {detail.series.label}
            </span>
          ) : '-',
        },
        { label: '수정 여부', value: detail.recurrenceException ? '개별 수정됨' : '수정 없음' },
        {
          label: '반복 예약 상세',
          value: (
            <Link className="text-link" to={`/admin/recurrences/${detail.series.id}`}>
              상세 보기
            </Link>
          ),
        },
      ],
    });
  }

  return (
    <section className="page-section" aria-labelledby="reservation-detail-title">
      <div className="page-header reservation-detail-page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="reservation-detail-title">{detail.room.name}</h1>
          <p className="muted">{formatDateTime(detail.startAt)} 예약</p>
        </div>
        <div className="header-actions reservation-navigation-actions" aria-label="예약 상세 이동">
          <Link
            className="secondary-button"
            to={timetableReservationUrl({ startAt: detail.startAt, roomId: detail.room.id })}
            data-testid="reservation-detail-timetable-link"
          >
            <CalendarDays size={16} aria-hidden="true" />
            시간표에서 보기
          </Link>
        </div>
      </div>

      <div className="detail-grid reservation-detail-grid">
        <ReservationDetailView
          status={detail.status}
          sections={coreSections}
        />

        <section className="panel reservation-action-panel" aria-labelledby="actions-title">
          <div>
            <h2 id="actions-title">상태 처리</h2>
          </div>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              performAction('approve');
            }}
          >
            <label>
              처리 메모
              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                rows={4}
                placeholder="승인 또는 취소 사유를 남깁니다."
              />
            </label>
            <div className="reservation-primary-actions" data-testid="reservation-primary-actions">
              <div className="button-row" aria-label="주요 상태 처리">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={approve.isPending || detail.status === 'CONFIRMED' || isCancelled}
                >
                  <Check size={16} aria-hidden="true" />
                  승인
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={cancel.isPending || isCancelled}
                  onClick={() => performAction('cancel')}
                >
                  <X size={16} aria-hidden="true" />
                  취소
                </button>
              </div>
              <div className="button-row reservation-management-actions" aria-label="예약 관리">
                <Link
                  className="secondary-button reservation-edit-action"
                  data-testid="reservation-edit-link"
                  to={`/admin/reservations/${detail.id}/edit`}
                >
                  <PenLine size={16} aria-hidden="true" />
                  수정
                </Link>
                <Link
                  className="secondary-button reservation-edit-action"
                  data-testid="reservation-duplicate-link"
                  to={timetableDuplicateReservationUrl(detail.id)}
                >
                  <Copy size={16} aria-hidden="true" />
                  복제
                </Link>
              </div>
            </div>
            {approve.isError ? <div className="inline-error" role="alert">{errorMessage(approve.error)}</div> : null}
            {cancel.isError ? <div className="inline-error" role="alert">{errorMessage(cancel.error)}</div> : null}
          </form>
        </section>
      </div>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">감사 이력</h2>
        {histories.isLoading ? <LoadingState message="감사 이력을 불러오는 중입니다." /> : null}
        {histories.isError ? <ErrorState error={histories.error} /> : null}
        {histories.data?.length ? (
          <ol className="timeline">
            {histories.data.map((history) => {
              const diffItems = updatedHistoryDiffs(history);

              return (
              <li key={history.id}>
                <strong>{historyActionLabel(history.action)}</strong>
                <span>
                  {history.beforeStatus ? statusLabels[history.beforeStatus] : '-'} →{' '}
                  {history.afterStatus ? statusLabels[history.afterStatus] : '-'}
                </span>
                <span className="muted">{formatDateTime(history.createdAt)} / {history.actorId}</span>
                {diffItems.length ? (
                  <dl className="timeline-diff" aria-label="수정된 필드">
                    {diffItems.map((item) => (
                      <div className="timeline-diff-row" key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>
                          <span className="timeline-diff-value">{item.before}</span>
                          <span className="timeline-diff-arrow" aria-hidden="true">→</span>
                          <span className="timeline-diff-value">{item.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {history.memo ? (
                  <p className="timeline-memo">
                    <span className="timeline-memo-label">처리 메모:</span> {history.memo}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ol>
        ) : null}
      </section>

      <div className="reservation-delete-action">
        <button
          type="button"
          className="danger-button"
          disabled={deleteReservation.isPending}
          onClick={() => setShowDeleteModal(true)}
          data-testid="reservation-delete-button"
        >
          <Trash2 size={16} aria-hidden="true" />
          예약 삭제
        </button>
        {deleteReservation.isError ? <div className="inline-error" role="alert">{errorMessage(deleteReservation.error)}</div> : null}
      </div>

      {showDeleteModal ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-panel reservation-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-delete-modal-title"
            aria-describedby="reservation-delete-modal-description"
            data-testid="reservation-delete-modal"
          >
            <div className="modal-header">
              <h2 id="reservation-delete-modal-title">예약을 영구 삭제할까요?</h2>
            </div>
            <p id="reservation-delete-modal-description" className="danger-copy">
              삭제하면 이 예약의 상세 정보는 더 이상 조회할 수 없습니다. 감사 로그에는 삭제 기록과 처리 메모가 남습니다.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowDeleteModal(false)} autoFocus>
                돌아가기
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={deleteReservation.isPending}
                onClick={performDelete}
                data-testid="reservation-delete-confirm-button"
              >
                <Trash2 size={16} aria-hidden="true" />
                {deleteReservation.isPending ? '삭제 중...' : '예약 삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isReservationNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

interface TimelineDiffItem {
  label: string;
  before: string;
  after: string;
}

function updatedHistoryDiffs(history: ReservationHistory): TimelineDiffItem[] {
  if (history.action !== 'UPDATED' || !hasBeforeSnapshot(history)) {
    return [];
  }

  const items: TimelineDiffItem[] = [];
  appendDiff(items, '강의실', history.beforeReservationRoomName, history.reservationRoomName);
  appendDiff(items, '신청자 이름', history.beforeReservationApplicantName, history.reservationApplicantName);
  appendDiff(items, '이메일', history.beforeReservationApplicantEmail, history.reservationApplicantEmail);
  appendDiff(items, '전화번호', history.beforeReservationApplicantPhone, history.reservationApplicantPhone);
  appendDiff(items, '예약 목적', history.beforeReservationPurpose, history.reservationPurpose);
  appendDiff(items, '시작 시간', formatOptionalDateTime(history.beforeReservationStartAt), formatOptionalDateTime(history.reservationStartAt));
  appendDiff(items, '종료 시간', formatOptionalDateTime(history.beforeReservationEndAt), formatOptionalDateTime(history.reservationEndAt));
  return items;
}

function hasBeforeSnapshot(history: ReservationHistory) {
  return Boolean(
    history.beforeReservationRoomName
      || history.beforeReservationPurpose
      || history.beforeReservationStartAt
      || history.beforeReservationEndAt
      || history.beforeReservationApplicantName
      || history.beforeReservationApplicantEmail
      || history.beforeReservationApplicantPhone
  );
}

function appendDiff(items: TimelineDiffItem[], label: string, before: string | null | undefined, after: string | null | undefined) {
  const beforeValue = displayValue(before);
  const afterValue = displayValue(after);
  if (beforeValue === afterValue) {
    return;
  }
  items.push({ label, before: beforeValue, after: afterValue });
}

function formatOptionalDateTime(value: string | null | undefined) {
  return value ? formatDateTime(value) : null;
}

function displayValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : '-';
}

function DeletedReservationState({ reservationId }: { reservationId: string }) {
  const navigate = useNavigate();

  return (
    <section className="page-section narrow" aria-labelledby="deleted-reservation-title">
      <div className="state-box error">
        <h1 id="deleted-reservation-title">삭제된 예약입니다</h1>
        <p>이 예약은 이미 삭제되어 상세 정보를 볼 수 없습니다. 감사 로그에서 삭제 기록은 계속 확인할 수 있습니다.</p>
        <div className="button-row">
          <button type="button" className="ghost-button" onClick={() => navigate(-1)}>
            이전 페이지로 돌아가기
          </button>
          <Link className="secondary-button" to="/admin/reservations">
            예약 목록으로 돌아가기
          </Link>
          <Link className="secondary-button" to={`/admin/audit?reservationId=${reservationId}`}>
            감사 로그로 이동
          </Link>
        </div>
      </div>
    </section>
  );
}
