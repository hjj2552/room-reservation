import { FormEvent, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../shared/api/http';
import type { AdminRoom, RoomPayload } from '../../shared/api/types';
import { ModalDialog } from '../../shared/components/ModalDialog';
import { Pagination } from '../../shared/components/Pagination';
import { SidePanel } from '../../shared/components/SidePanel';
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
import { lastPageIndex, parsePageParam } from '../../shared/utils/page';

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

const pageSize = 20;
const RoomOrderPanelContent = lazy(() => import('../components/RoomOrderPanel').then((module) => ({
  default: module.RoomOrderPanelContent,
})));

export function RoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedKeyword = searchParams.get('keyword') || '';
  const pageParam = searchParams.get('page');
  const page = parsePageParam(pageParam);
  const [keyword, setKeyword] = useState(appliedKeyword);
  const previousAppliedKeywordRef = useRef(appliedKeyword);
  const [editingRoom, setEditingRoom] = useState<AdminRoom | null>(null);
  const [isFormPanelOpen, setIsFormPanelOpen] = useState(false);
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminRoom | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [form, setForm] = useState<RoomFormState>(emptyForm);
  const rooms = useRooms({
    includeDeleted: false,
    keyword: appliedKeyword,
    page,
    size: pageSize,
  });
  const deletionCheck = useRoomDeletionCheck(deleteTarget?.id);
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(editingRoom?.id || '');
  const toggleEnabled = useUpdateRoomEnabled();
  const deleteRoom = useDeleteRoom();

  useEffect(() => {
    const previousAppliedKeyword = previousAppliedKeywordRef.current;
    previousAppliedKeywordRef.current = appliedKeyword;
    setKeyword((currentKeyword) => (
      currentKeyword === previousAppliedKeyword ? appliedKeyword : currentKeyword
    ));
  }, [appliedKeyword]);

  useEffect(() => {
    const invalidPage = pageParam !== null && pageParam !== String(page);
    if (!invalidPage && (!rooms.data || page < rooms.data.totalPages)) return;
    const nextPage = invalidPage ? 0 : lastPageIndex(rooms.data!.totalPages);
    if (!invalidPage && page === nextPage) return;
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next, { replace: true });
  }, [page, pageParam, rooms.data, searchParams, setSearchParams]);

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
        onSuccess: closeFormPanel,
      });
      return;
    }
    createRoom.mutate(payload, {
      onSuccess: closeFormPanel,
    });
  }

  function openCreatePanel() {
    setEditingRoom(null);
    setForm(emptyForm);
    createRoom.reset();
    updateRoom.reset();
    setIsFormPanelOpen(true);
  }

  function openEditPanel(room: AdminRoom) {
    setEditingRoom(room);
    createRoom.reset();
    updateRoom.reset();
    setIsFormPanelOpen(true);
  }

  function closeFormPanel() {
    setIsFormPanelOpen(false);
    setEditingRoom(null);
    createRoom.reset();
    updateRoom.reset();
  }

  function applySearch(nextKeyword: string) {
    const next = new URLSearchParams(searchParams);
    const normalized = nextKeyword.trim();
    if (normalized) next.set('keyword', normalized);
    else next.delete('keyword');
    next.set('page', '0');
    setSearchParams(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
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
          setIsFormPanelOpen(false);
        }
        closeDeleteModal();
      },
    });
  }

  const mutationError = createRoom.error || updateRoom.error;
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
    <section className="page-section rooms-page" aria-labelledby="rooms-title">
      <div className="page-header">
        <div>
          <h1 id="rooms-title">공간 관리</h1>
          <p className="muted">예약에 사용할 공간을 등록하고, 삭제된 공간의 예약 기록은 보존합니다.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            data-testid="room-order-button"
            onClick={() => setIsOrderPanelOpen(true)}
          >
            순서 변경
          </button>
          <button
            type="button"
            className="primary-button"
            data-testid="room-create-button"
            onClick={openCreatePanel}
          >
            공간 등록
          </button>
        </div>
      </div>

      <section className="panel room-list-panel" aria-labelledby="room-list-title">
          <div className="panel-header">
            <h2 id="room-list-title">공간 목록</h2>
          </div>
          <form
            className="inline-filter"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch(keyword);
            }}
          >
            <label>
              검색어
              <input
                data-testid="room-keyword-input"
                type="search"
                value={keyword}
                placeholder="공간명 또는 위치"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary-button" data-testid="room-search-button">조회</button>
            <button
              type="button"
              className="ghost-button"
              data-testid="room-search-reset"
              onClick={() => {
                setKeyword('');
                applySearch('');
              }}
            >
              초기화
            </button>
          </form>

          {rooms.isLoading ? <LoadingState /> : null}
          {rooms.isError ? <ErrorState error={rooms.error} /> : null}
          {toggleEnabled.error ? <div className="inline-error" role="alert">{errorMessage(toggleEnabled.error)}</div> : null}
          {rooms.data?.items.length === 0 ? <EmptyState message="등록된 공간이 없습니다." /> : null}
          {rooms.data?.items.length ? (
            <>
              <div className="table-wrap">
                <table className="data-table rooms-table" data-testid="rooms-table">
                <caption className="sr-only">공간 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">공간</th>
                    <th scope="col" className="nowrap-cell">예약 대상</th>
                    <th scope="col" className="nowrap-cell numeric-cell">정원</th>
                    <th scope="col" className="nowrap-cell">수정일</th>
                    <th scope="col" className="nowrap-cell">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.data.items.map((room) => (
                    <tr key={room.id}>
                      <td className="table-room-cell">
                        <strong>{room.name}</strong>
                        <br />
                        <span className="muted">{room.location || '-'}</span>
                      </td>
                      <td className="nowrap-cell">
                        <span className={`plain-badge ${room.enabled ? 'good' : 'muted-badge'}`}>
                          {room.enabled ? '사용 중' : '제외됨'}
                        </span>
                      </td>
                      <td className="nowrap-cell numeric-cell">{room.capacity ?? 0}명</td>
                      <td className="nowrap-cell">{formatDateTime(room.updatedAt)}</td>
                      <td>
                        <div className="button-row table-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            data-testid="room-edit-button"
                            onClick={() => openEditPanel(room)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            data-testid="room-enabled-toggle"
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
              <Pagination
                page={rooms.data.page}
                totalPages={rooms.data.totalPages}
                totalItems={rooms.data.totalItems}
                size={rooms.data.size}
                onPageChange={setPage}
              />
            </>
          ) : null}
      </section>

      {isOrderPanelOpen ? (
        <SidePanel
          title="순서 변경"
          titleId="room-order-title"
          className="room-order-panel"
          onClose={() => setIsOrderPanelOpen(false)}
          testId="room-order-panel"
          closeTestId="room-order-close"
          closeButtonLabel="순서 변경 패널 닫기"
        >
          <Suspense fallback={<LoadingState />}>
            <RoomOrderPanelContent onClose={() => setIsOrderPanelOpen(false)} />
          </Suspense>
        </SidePanel>
      ) : null}

      {isFormPanelOpen ? (
        <SidePanel
          title={editingRoom ? '공간 수정' : '공간 등록'}
          titleId="room-form-title"
          className="room-form-panel"
          onClose={closeFormPanel}
          testId="room-form-panel"
          backdropTestId="room-form-backdrop"
          closeTestId="room-form-close"
          closeButtonLabel={`${editingRoom ? '공간 수정' : '공간 등록'} 패널 닫기`}
        >
          <form className="form-stack" data-testid="room-form" onSubmit={handleSubmit}>
            <label>
              공간 이름
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
              공간 이용 안내
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
              {editingRoom ? '수정 저장' : '공간 등록'}
            </button>
          </form>
        </SidePanel>
      ) : null}

      {deleteTarget ? (
        <ModalDialog
          title="공간 영구 삭제"
          titleId="room-delete-title"
          onClose={closeDeleteModal}
          closeDisabled={deleteRoom.isPending}
          testId="room-delete-modal"
        >
          <p className="danger-copy">
            삭제 후 복구할 수 없습니다. 공간은 목록에서 제거되며 기존 예약 기록은 삭제된 공간으로 보존됩니다.
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
            삭제하려면 공간 이름 <strong>{deleteTarget.name}</strong>을 다시 입력하세요.
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
              돌아가기
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
        </ModalDialog>
      ) : null}
    </section>
  );
}
