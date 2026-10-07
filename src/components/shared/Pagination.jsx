import React, { useMemo } from 'react';

function buildPageList(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1, currentPage - 2, currentPage + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({
  currentPage,
  totalPages,
  totalRecords,
  startRecord,
  endRecord,
  pageSize = 10,
  nextPage,
  prevPage,
  goToPage,
}) {
  const pages = useMemo(
    () => buildPageList(currentPage || 1, totalPages || 1),
    [currentPage, totalPages]
  );

  if (!totalRecords) return null;

  const start = startRecord ?? ((currentPage - 1) * pageSize + 1);
  const end = endRecord ?? Math.min(currentPage * pageSize, totalRecords);

  return (
    <div className="pagination-bar">
      <div className="pagination-bar-mobile">
        <button
          onClick={prevPage}
          disabled={currentPage === 1}
          className="button secondary"
          type="button"
        >
          Previous
        </button>
        <span className="pagination-summary-compact">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={nextPage}
          disabled={currentPage === totalPages}
          className="button secondary"
          type="button"
        >
          Next
        </button>
      </div>

      <div className="pagination-bar-desktop">
        <p className="pagination-summary">
          Showing <strong>{start}</strong>–<strong>{end}</strong> of{' '}
          <strong>{totalRecords}</strong> records
        </p>
        <nav className="pagination-nav" aria-label="Pagination">
          <button
            onClick={prevPage}
            disabled={currentPage === 1}
            type="button"
            aria-label="Previous page"
          >
            Previous
          </button>
          {pages.map((page, index) => (
            page === 'ellipsis' ? (
              <span key={`e-${index}`} className="pagination-ellipsis" aria-hidden="true">…</span>
            ) : (
              <button
                key={page}
                type="button"
                className={page === currentPage ? 'pagination-page is-active' : 'pagination-page'}
                onClick={() => goToPage?.(page)}
                aria-current={page === currentPage ? 'page' : undefined}
                disabled={!goToPage}
              >
                {page}
              </button>
            )
          ))}
          <button
            onClick={nextPage}
            disabled={currentPage === totalPages}
            type="button"
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  );
}
