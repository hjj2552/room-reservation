import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../shared/api/http';
import { ModalDialog } from '../../shared/components/ModalDialog';
import { PublicVisibilityValue } from '../../shared/components/ReservationDetailView';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useDeleteRecurrence, useRecurrence } from '../../shared/hooks/useRecurrences';
import { formatDate, formatDateTime, formatTime } from '../../shared/utils/date';
import { conflictPolicyLabels } from '../../shared/utils/labels';
import { timetableReservationUrl } from '../../shared/utils/timetable';
import { formatDayCodes } from '../../shared/utils/weekdays';
import { adminListPath } from '../utils/listContext';

export function RecurrenceDetailPage() {
  const { recurrenceId = '' } = useParams();
  const navigate = useNavigate();
  const recurrence = useRecurrence(recurrenceId);
  const deleteRecurrence = useDeleteRecurrence();
  const [memo, setMemo] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function performDelete() {
    deleteRecurrence.mutate(
      { recurrenceId, memo: memo || undefined },
      {
        onSuccess: () => {
          setShowDeleteModal(false);
          navigate(adminListPath('recurrences'));
        },
      },
    );
  }

  function openDeleteModal() {
    deleteRecurrence.reset();
    setShowDeleteModal(true);
  }

  if (recurrence.isLoading) return <LoadingState />;
  if (recurrence.isError) return <ErrorState error={recurrence.error} />;
  if (!recurrence.data) return null;

  const detail = recurrence.data;
  const statusCounts = detail.reservations.reduce(
    (counts, reservation) => {
      counts[reservation.status] += 1;
      return counts;
    },
    { REQUESTED: 0, CONFIRMED: 0, CANCELLED: 0 },
  );
  const modifiedCount = detail.reservations.filter((reservation) => reservation.exception).length;

  return (
    <section className="page-section" aria-labelledby="recurrence-detail-title">
      <div className="page-header">
        <div>
          <h1 id="recurrence-detail-title">{detail.room.name}</h1>
          <p className="muted" data-testid="recurrence-detail-purpose">{detail.purpose}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => navigate(adminListPath('recurrences'))}>
            목록으로
          </button>
          <Link className="secondary-button" to="/admin/reservations">
            예약 목록 보기
          </Link>
        </div>
      </div>

      <div className="detail-grid recurrence-detail-grid">
        <section className="panel" aria-labelledby="recurrence-basic-title">
          <h2 id="recurrence-basic-title">기본 정보</h2>
          <dl className="description-list">
            <div>
              <dt>공간</dt>
              <dd data-testid="recurrence-detail-room">{detail.room.name} {detail.room.location ? `(${detail.room.location})` : ''}</dd>
            </div>
            <div>
              <dt>기간</dt>
              <dd data-testid="recurrence-detail-period">{formatDate(detail.startDate)} ~ {formatDate(detail.endDate)}</dd>
            </div>
            <div>
              <dt>요일/시간</dt>
              <dd data-testid="recurrence-detail-schedule">{formatDayCodes(detail.daysOfWeek)} / {formatTime(detail.startTime)}~{formatTime(detail.endTime)}</dd>
            </div>
            <div>
              <dt>충돌 정책</dt>
              <dd>{conflictPolicyLabels[detail.conflictPolicy]}</dd>
            </div>
            <div>
              <dt>태그</dt>
              <dd data-testid="recurrence-detail-tag">
                {detail.tagName ? (
                  <span
                    className="series-chip"
                    style={detail.tagColor ? { borderColor: detail.tagColor, color: detail.tagColor } : undefined}
                  >
                    {detail.tagName}
                  </span>
                ) : '-'}
              </dd>
            </div>
            <div>
              <dt>신청자 이름</dt>
              <dd>
                <PublicVisibilityValue
                  value={detail.applicantName}
                  isPublic={detail.showApplicantName}
                  testId="recurrence-detail-applicant-name"
                />
              </dd>
            </div>
            <div>
              <dt>전화번호</dt>
              <dd>
                <PublicVisibilityValue
                  value={detail.applicantPhone}
                  isPublic={false}
                  testId="recurrence-detail-applicant-phone"
                />
              </dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>
                <PublicVisibilityValue
                  value={detail.applicantEmail}
                  isPublic={false}
                  testId="recurrence-detail-applicant-email"
                />
              </dd>
            </div>
            <div>
              <dt>등록일</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
          </dl>
        </section>

      </div>

      <section className="panel recurrence-reservations-panel" aria-labelledby="recurrence-reservations-title">
        <h2 id="recurrence-reservations-title">생성된 개별 예약</h2>
        <div className="table-wrap">
          <table className="data-table recurrence-reservations-table" data-testid="recurrence-reservations-table">
            <thead>
              <tr>
                <th scope="col">예약 시간</th>
                <th scope="col">공간</th>
                <th scope="col">상태</th>
                <th scope="col">목적</th>
                <th scope="col">시간표</th>
              </tr>
            </thead>
            <tbody>
              {detail.reservations.map((reservation) => (
                <tr
                  key={reservation.id}
                  tabIndex={0}
                  className="clickable-row"
                  onClick={() => navigate(`/admin/reservations/${reservation.id}`)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter') navigate(`/admin/reservations/${reservation.id}`);
                  }}
                >
                  <td>
                    <span className="table-cell-stack nowrap-cell">
                      <span>{formatDateTime(reservation.startAt)}</span>
                      <span className="muted">~ {formatDateTime(reservation.endAt)}</span>
                    </span>
                  </td>
                  <td className="table-text-cell">{reservation.roomName}</td>
                  <td><StatusBadge status={reservation.status} /></td>
                  <td className="table-text-cell">
                    {reservation.purpose}
                    {reservation.exception ? <div className="muted">개별 수정됨</div> : null}
                  </td>
                  <td className="nowrap-cell">
                    <Link
                      className="text-link"
                      to={timetableReservationUrl({ startAt: reservation.startAt, roomId: reservation.roomId })}
                      onClick={(event) => event.stopPropagation()}
                    >
                      시간표에서 보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="reservation-delete-action">
        <button
          type="button"
          className="danger-button"
          disabled={deleteRecurrence.isPending}
          onClick={openDeleteModal}
          data-testid="recurrence-delete-button"
        >
          <Trash2 size={16} aria-hidden="true" />
          반복 예약 영구 삭제
        </button>
      </div>

      {showDeleteModal ? (
        <ModalDialog
          title="반복 예약을 영구 삭제할까요?"
          titleId="recurrence-delete-modal-title"
          ariaDescribedBy="recurrence-delete-modal-description"
          className="reservation-delete-modal"
          onClose={() => setShowDeleteModal(false)}
          closeDisabled={deleteRecurrence.isPending}
          testId="recurrence-delete-modal"
        >
          <p id="recurrence-delete-modal-description" className="danger-copy">
            연결된 개별 예약 {detail.reservations.length}건도 모두 영구 삭제되며 되돌릴 수 없습니다.
          </p>
          <dl className="recurrence-delete-summary" data-testid="recurrence-delete-summary">
            <div><dt>전체</dt><dd>{detail.reservations.length}건</dd></div>
            <div><dt>승인 대기</dt><dd>{statusCounts.REQUESTED}건</dd></div>
            <div><dt>승인</dt><dd>{statusCounts.CONFIRMED}건</dd></div>
            <div><dt>취소</dt><dd>{statusCounts.CANCELLED}건</dd></div>
          </dl>
          <p className="muted">
            개별 수정된 예약 {modifiedCount}건과 이미 취소된 예약 {statusCounts.CANCELLED}건도 삭제 대상입니다.
          </p>
          <label>
            삭제 메모 (선택)
            <textarea
              data-testid="recurrence-delete-memo-input"
              rows={3}
              value={memo}
              disabled={deleteRecurrence.isPending}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="삭제 사유를 남깁니다."
            />
          </label>
          {deleteRecurrence.isError ? (
            <div className="inline-error" role="alert">{errorMessage(deleteRecurrence.error)}</div>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteRecurrence.isPending}
              autoFocus
            >
              돌아가기
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={deleteRecurrence.isPending}
              onClick={performDelete}
              data-testid="recurrence-delete-confirm-button"
            >
              <Trash2 size={16} aria-hidden="true" />
              {deleteRecurrence.isPending ? '삭제 중...' : '반복 예약 영구 삭제'}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </section>
  );
}
