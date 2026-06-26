interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  size: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, size, onPageChange }: PaginationProps) {
  const currentPage = page + 1;

  if (totalPages <= 1) {
    return (
      <p className="result-summary">
        총 {totalItems.toLocaleString()}건 · 페이지당 {size}건
      </p>
    );
  }

  const pages = pageWindow(currentPage, totalPages);

  return (
    <div className="pagination" aria-label="페이지 이동">
      <p>
        총 {totalItems.toLocaleString()}건 · {currentPage}/{totalPages}페이지 · 페이지당 {size}건
      </p>
      <div className="page-buttons">
        <button
          type="button"
          className="ghost-button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </button>
        {pages[0] > 1 ? (
          <>
            <PageButton pageNumber={1} currentPage={currentPage} onPageChange={onPageChange} />
            {pages[0] > 2 ? <span className="page-ellipsis" aria-hidden="true">...</span> : null}
          </>
        ) : null}
        {pages.map((pageNumber) => (
          <PageButton
            key={pageNumber}
            pageNumber={pageNumber}
            currentPage={currentPage}
            onPageChange={onPageChange}
          />
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="page-ellipsis" aria-hidden="true">...</span> : null}
            <PageButton pageNumber={totalPages} currentPage={currentPage} onPageChange={onPageChange} />
          </>
        ) : null}
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

function PageButton({
  pageNumber,
  currentPage,
  onPageChange,
}: {
  pageNumber: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <button
      type="button"
      className="page-button"
      aria-current={pageNumber === currentPage ? 'page' : undefined}
      disabled={pageNumber === currentPage}
      onClick={() => onPageChange(pageNumber - 1)}
    >
      {pageNumber}
    </button>
  );
}

function pageWindow(currentPage: number, totalPages: number) {
  const radius = 2;
  const start = Math.max(1, currentPage - radius);
  const end = Math.min(totalPages, currentPage + radius);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
