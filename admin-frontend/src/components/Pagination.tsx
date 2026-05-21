interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  size: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, size, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <p className="result-summary">
        총 {totalItems.toLocaleString()}건
      </p>
    );
  }

  const currentPage = page + 1;

  return (
    <div className="pagination" aria-label="페이지 이동">
      <p>
        총 {totalItems.toLocaleString()}건 · {currentPage}/{totalPages}페이지 · 페이지당 {size}건
      </p>
      <div className="button-row">
        <button
          type="button"
          className="ghost-button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={page + 1 >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
}
