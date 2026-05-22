import { FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../api/http';
import type { AdminRoom, RoomPayload } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import {
  useCreateRoom,
  useRooms,
  useUpdateRoom,
  useUpdateRoomEnabled,
} from '../hooks/useRooms';
import { formatDateTime } from '../utils/date';

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
  const [form, setForm] = useState<RoomFormState>(emptyForm);
  const rooms = useRooms({ includeDeleted: false, keyword: appliedKeyword, size: 100 });
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(editingRoom?.id || '');
  const toggleEnabled = useUpdateRoomEnabled();

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

  const mutationError = createRoom.error || updateRoom.error || toggleEnabled.error;

  return (
    <section className="page-section" aria-labelledby="rooms-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">운영 관리</p>
          <h1 id="rooms-title">강의실 관리</h1>
          <p className="muted">예약에 사용할 강의실을 등록하고 운영 여부를 관리합니다.</p>
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
              <table className="data-table" data-testid="rooms-table">
                <caption className="sr-only">강의실 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">상태</th>
                    <th scope="col">강의실</th>
                    <th scope="col">정원</th>
                    <th scope="col">수정일</th>
                    <th scope="col">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.data.items.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <span className={`plain-badge ${room.enabled ? 'good' : 'muted-badge'}`}>
                          {room.enabled ? '운영 중' : '비활성'}
                        </span>
                      </td>
                      <td>
                        <strong>{room.name}</strong>
                        <br />
                        <span className="muted">{room.location || '-'}</span>
                      </td>
                      <td>{room.capacity ?? 0}명</td>
                      <td>{formatDateTime(room.updatedAt)}</td>
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
                            {room.enabled ? '비활성화' : '활성화'}
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
              예약 가능 상태로 운영
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
    </section>
  );
}
