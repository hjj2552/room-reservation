import { FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/http';
import type { AdminRoom, RoomPayload } from '../../shared/api/types';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import {
  useCreateRoom,
  useDeleteRoom,
  useRoomDeletionCheck,
  useRooms,
  useUpdateRoom,
  useUpdateRoomEnabled,
} from '../../shared/hooks/useRooms';
import { formatDateTime } from '../../shared/utils/date';

interface RoomFormState {
  name: string;
  location: string;
  capacity: string;
  description: string;
  enabled: boolean;
}

const emptyForm: RoomFormState = {
  name: '',
  location: '',
  capacity: '0',
  description: '',
  enabled: true,
};

export function RoomsPage() {
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [editingRoom, setEditingRoom] = useState<AdminRoom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRoom | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [form, setForm] = useState<RoomFormState>(emptyForm);
  const rooms = useRooms({ includeDeleted: false, keyword: appliedKeyword, size: 100 });
  const deletionCheck = useRoomDeletionCheck(deleteTarget?.id);
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(editingRoom?.id || '');
  const toggleEnabled = useUpdateRoomEnabled();
  const deleteRoom = useDeleteRoom();

  useEffect(() => {
    if (!editingRoom) {
      setForm(emptyForm);
      return;
    }
    setForm({
      name: editingRoom.name,
      location: editingRoom.location || '',
      capacity: String(editingRoom.capacity ?? 0),
      description: editingRoom.description || '',
      enabled: editingRoom.enabled,
    });
  }, [editingRoom]);

  function toPayload(): RoomPayload {
    return {
      name: form.name,
      location: form.location || undefined,
      capacity: Number(form.capacity),
      description: form.description || undefined,
      enabled: form.enabled,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toPayload();
    if (editingRoom) {
      updateRoom.mutate(payload, {
        onSuccess: (room) => setEditingRoom(room),
      });
      return;
    }
    createRoom.mutate(payload, {
      onSuccess: () => setForm(emptyForm),
    });
  }

  function openDeleteModal(room: AdminRoom) {
    setDeleteTarget(room);
    setDeleteConfirmation('');
    deleteRoom.reset();
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteConfirmation('');
    deleteRoom.reset();
  }

  function handleDelete() {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name || !deletionCheck.data?.deletable) {
      return;
    }
    deleteRoom.mutate(deleteTarget.id, {
      onSuccess: () => {
        if (editingRoom?.id === deleteTarget.id) {
          setEditingRoom(null);
        }
        closeDeleteModal();
      },
    });
  }

  const mutationError = createRoom.error || updateRoom.error || toggleEnabled.error;
  const canDelete =
    Boolean(deleteTarget) &&
    deleteConfirmation === deleteTarget?.name &&
    Boolean(deletionCheck.data?.deletable) &&
    !deleteRoom.isPending;
  const visibleDeletionChecks = deletionCheck.data?.checks.filter((check) => check.count > 0) ?? [];

  function deletionCheckSummary(check: { code: string; count: number }) {
    if (check.code === 'RESERVATION_REFERENCES_REASSIGNED') {
      return `연결된 예약 기록 ${check.count}건`;
    }
    if (check.code === 'RECURRENCE_REFERENCES_REASSIGNED') {
      return `연결된 반복 예약 기록 ${check.count}건`;
    }
    return `${check.count}건`;
  }

  return (
    <section className="page-section" aria-labelledby="rooms-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="rooms-title">강의실 관리</h1>
          <p className="muted">예약에 사용할 강의실을 등록하고, 삭제된 강의실의 예약 기록은 보존합니다.</p>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="room-list-title">
          <div className="panel-header">
            <h2 id="room-list-title">강의실 목록</h2>
          </div>
          <form
            className="inline-filter"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedKeyword(keyword);
            }}
          >
            <label>
              검색어
              <input
                type="search"
                value={keyword}
                placeholder="강의실명 또는 위치"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary-button">조회</button>
          </form>

          {rooms.isLoading ? <LoadingState /> : null}
          {rooms.isError ? <ErrorState error={rooms.error} /> : null}
          {rooms.data?.items.length === 0 ? <EmptyState message="등록된 강의실이 없습니다." /> : null}
          {rooms.data?.items.length ? (
            <div className="table-wrap">
              <table className="data-table rooms-table" data-testid="rooms-table">
                <caption className="sr-only">강의실 목록</caption>
                <thead>
                  <tr>
                    <th scope="col" className="nowrap-cell">예약 대상</th>
                    <th scope="col">강의실</th>
                    <th scope="col" className="nowrap-cell">정원</th>
                    <th scope="col" className="nowrap-cell">수정일</th>
                    <th scope="col" className="nowrap-cell">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.data.items.map((room) => (
                    <tr key={room.id}>
                      <td className="nowrap-cell">
                        <span className={`plain-badge ${room.enabled ? 'good' : 'muted-badge'}`}>
                          {room.enabled ? '사용 중' : '제외됨'}
                        </span>
                      </td>
                      <td>
                        <strong>{room.name}</strong>
                        <br />
                        <span className="muted">{room.location || '-'}</span>
                      </td>
                      <td className="nowrap-cell">{room.capacity ?? 0}명</td>
                      <td className="nowrap-cell">{formatDateTime(room.updatedAt)}</td>
                      <td>
                        <div className="button-row table-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            data-testid="room-edit-button"
                            onClick={() => setEditingRoom(room)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={toggleEnabled.isPending}
                            onClick={() => toggleEnabled.mutate({ roomId: room.id, enabled: !room.enabled })}
                          >
                            {room.enabled ? '예약 대상 제외' : '예약 대상 포함'}
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            data-testid="room-delete-button"
                            onClick={() => openDeleteModal(room)}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="room-form-title">
          <div className="panel-header">
            <h2 id="room-form-title">{editingRoom ? '강의실 수정' : '강의실 등록'}</h2>
            {editingRoom ? (
              <button type="button" className="ghost-button" onClick={() => setEditingRoom(null)}>
                새 강의실 입력
              </button>
            ) : null}
          </div>
          <form className="form-stack" data-testid="room-form" onSubmit={handleSubmit}>
            <label>
              강의실명
              <input
                data-testid="room-name-input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              위치
              <input
                data-testid="room-location-input"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              />
            </label>
            <label>
              정원
              <input
                data-testid="room-capacity-input"
                type="number"
                min="0"
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
                required
              />
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              예약 대상으로 사용
            </label>
            <label>
              설명
              <textarea
                data-testid="room-description-input"
                rows={4}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            {mutationError ? <div className="inline-error" role="alert">{errorMessage(mutationError)}</div> : null}
            <button
              type="submit"
              className="primary-button"
              data-testid="room-save-button"
              disabled={createRoom.isPending || updateRoom.isPending}
            >
              {editingRoom ? '수정 저장' : '강의실 등록'}
            </button>
          </form>
        </section>
      </div>

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-delete-title"
            data-testid="room-delete-modal"
          >
            <div className="modal-header">
              <div>
                <h2 id="room-delete-title">강의실 영구 삭제</h2>
              </div>
            </div>
            <p className="danger-copy">
              삭제 후 복구할 수 없습니다. 강의실은 목록에서 제거되며 기존 예약 기록은 삭제된 강의실로 보존됩니다.
            </p>

            {deletionCheck.isLoading ? <LoadingState /> : null}
            {deletionCheck.isError ? <ErrorState error={deletionCheck.error} /> : null}
            {visibleDeletionChecks.length ? (
              <ul className="check-list" data-testid="room-delete-checks">
                {visibleDeletionChecks.map((check) => (
                  <li key={check.code} className={check.passed ? 'check-passed' : 'check-failed'}>
                    <span>{deletionCheckSummary(check)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {deletionCheck.data?.blockers.length ? (
              <div className="inline-error" role="alert" data-testid="room-delete-blockers">
                {deletionCheck.data.blockers.map((blocker) => (
                  <p key={blocker.code}>{blocker.message} ({blocker.count}건)</p>
                ))}
              </div>
            ) : null}

            <label>
              삭제하려면 강의실명 <strong>{deleteTarget.name}</strong>을 다시 입력하세요.
              <input
                data-testid="room-delete-confirm-input"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            {deleteRoom.error ? <div className="inline-error" role="alert">{errorMessage(deleteRoom.error)}</div> : null}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeDeleteModal} autoFocus>
                취소
              </button>
              <button
                type="button"
                className="danger-button"
                data-testid="room-delete-confirm-button"
                disabled={!canDelete}
                onClick={handleDelete}
              >
                영구 삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
