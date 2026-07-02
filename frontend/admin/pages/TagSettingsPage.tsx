import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { errorMessage } from '../../shared/api/http';
import type { Tag, TagFilters } from '../../shared/api/types';
import { Pagination } from '../../shared/components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../../shared/hooks/useTags';

interface TagForm {
  name: string;
  color: string;
}

const initialForm: TagForm = {
  name: '',
  color: '#2563eb',
};
const pageSize = 20;

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function TagSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TagForm>(initialForm);
  const page = numberParam(searchParams.get('page'), 0);
  const filters = useMemo<TagFilters>(() => ({ page, size: pageSize }), [page]);
  const tags = useTags(filters);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const formError = createTag.error || updateTag.error;

  useEffect(() => {
    searchParamsRef.current = new URLSearchParams(window.location.search);
  }, [searchParams]);

  useEffect(() => {
    if (!isFormOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') resetForm();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen]);

  function setParam(name: string, value: string, options: { resetPage?: boolean } = { resetPage: true }) {
    const next = new URLSearchParams(searchParamsRef.current);
    if (value) next.set(name, value);
    else next.delete(name);
    if (options.resetPage !== false) next.set('page', '0');
    searchParamsRef.current = next;
    setSearchParams(new URLSearchParams(next));
  }

  function focusNameInput() {
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function startCreate() {
    setEditingTag(null);
    setForm(initialForm);
    setIsFormOpen(true);
    createTag.reset();
    updateTag.reset();
    focusNameInput();
  }

  function startEdit(tag: Tag) {
    setEditingTag(tag);
    setForm({ name: tag.name, color: tag.color });
    setIsFormOpen(true);
    createTag.reset();
    updateTag.reset();
    focusNameInput();
  }

  function resetForm() {
    setEditingTag(null);
    setForm(initialForm);
    setIsFormOpen(false);
    createTag.reset();
    updateTag.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name: form.name, color: form.color };
    if (editingTag) {
      updateTag.mutate(
        { tagId: editingTag.id, payload },
        { onSuccess: () => resetForm() },
      );
      return;
    }
    createTag.mutate(payload, {
      onSuccess: () => resetForm(),
    });
  }

  function handleDelete() {
    if (!deletingTag) return;
    deleteTag.mutate(deletingTag.id, {
      onSuccess: () => {
        if (editingTag?.id === deletingTag.id) {
          resetForm();
        }
        setDeletingTag(null);
      },
    });
  }

  return (
    <section className="page-section" aria-labelledby="tag-settings-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="tag-settings-title">태그 설정</h1>
          <p className="muted">반복 예약에 사용할 태그 이름과 색상을 관리합니다.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary-button" onClick={startCreate}>
            <Plus size={16} aria-hidden="true" />
            태그 만들기
          </button>
        </div>
      </div>

      <section className="panel tag-list-panel" aria-labelledby="tag-list-title">
        <div className="panel-header">
          <h2 id="tag-list-title">태그 목록</h2>
        </div>
        {tags.isLoading ? <LoadingState /> : null}
        {tags.isError ? <ErrorState error={tags.error} /> : null}
        {tags.data?.items.length === 0 ? <EmptyState message="등록된 태그가 없습니다." /> : null}
        {tags.data?.items.length ? (
          <>
            <div className="table-wrap tag-table-wrap">
              <table className="data-table tag-table" data-testid="tags-table">
                <caption className="sr-only">태그 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">이름</th>
                    <th scope="col">색상</th>
                    <th scope="col">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {tags.data.items.map((tag) => (
                    <tr key={tag.id}>
                      <td>{tag.name}</td>
                      <td>
                        <span className="tag-color-swatch" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                        <span className="muted">{tag.color}</span>
                      </td>
                      <td>
                        <div className="button-row table-actions">
                          <button type="button" className="ghost-button" onClick={() => startEdit(tag)}>
                            <Pencil size={16} aria-hidden="true" />
                            수정
                          </button>
                          <button type="button" className="danger-button" onClick={() => setDeletingTag(tag)}>
                            <Trash2 size={16} aria-hidden="true" />
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
              page={tags.data.page}
              totalPages={tags.data.totalPages}
              totalItems={tags.data.totalItems}
              size={tags.data.size}
              onPageChange={(nextPage) => setParam('page', String(nextPage), { resetPage: false })}
            />
          </>
        ) : null}
      </section>

      {isFormOpen ? (
        <aside
          className="quick-add-panel reservation-request-panel"
          aria-labelledby="tag-form-title"
          data-testid="tag-form-panel"
        >
          <div className="quick-add-header">
            <div>
              <h2 id="tag-form-title">{editingTag ? '태그 수정' : '태그 만들기'}</h2>
              <p className="muted">{editingTag ? '태그 이름과 표시 색상을 변경합니다.' : '반복 예약에서 선택할 태그를 추가합니다.'}</p>
            </div>
            <button
              type="button"
              className="ghost-button icon-button"
              onClick={resetForm}
              aria-label="태그 입력 패널 닫기"
              data-testid="tag-form-close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <form className="quick-add-form compact-request-form" onSubmit={handleSubmit}>
            <label className="full-span request-title-field">
              태그
              <input
                ref={nameInputRef}
                data-testid="tag-name-input"
                name="name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="예: 1학년, 교직원 등"
                required
              />
            </label>
            <label className="full-span">
              표시 색상
              <input
                className="series-color-input"
                data-testid="tag-color-input"
                name="color"
                type="color"
                value={form.color}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                required
              />
            </label>
            {formError ? <div className="inline-error full-span" role="alert">{errorMessage(formError)}</div> : null}
            {editingTag ? (
              <button type="button" className="ghost-button full-span" onClick={startCreate}>
                새 태그 입력
              </button>
            ) : null}
            <div className="button-row request-form-actions full-span">
              <button type="button" className="ghost-button" onClick={resetForm}>
                취소
              </button>
              <button type="submit" className="primary-button" disabled={createTag.isPending || updateTag.isPending}>
                {createTag.isPending || updateTag.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </aside>
      ) : null}

      {deletingTag ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel reservation-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-tag-title">
            <div className="modal-header">
              <h2 id="delete-tag-title">태그 삭제</h2>
            </div>
            <p className="danger-copy">
              {deletingTag.name} 태그를 삭제하면 참조 중인 반복 예약의 태그가 없음으로 변경됩니다.
            </p>
            {deleteTag.isError ? <div className="inline-error" role="alert">{errorMessage(deleteTag.error)}</div> : null}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setDeletingTag(null)}>
                취소
              </button>
              <button type="button" className="danger-button" onClick={handleDelete} disabled={deleteTag.isPending}>
                {deleteTag.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
