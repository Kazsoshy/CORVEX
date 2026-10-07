import { useState, useMemo, useEffect } from 'react';

export const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side pagination for an in-memory array.
 * @param {Array} dataArray
 * @param {number|object} pageSizeOrOptions - page size (default 10) or { pageSize, resetKey }
 */
export function usePagination(dataArray, pageSizeOrOptions = DEFAULT_PAGE_SIZE) {
  const options = typeof pageSizeOrOptions === 'object' && pageSizeOrOptions !== null
    ? pageSizeOrOptions
    : { pageSize: pageSizeOrOptions };

  const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : DEFAULT_PAGE_SIZE;
  const resetKey = options.resetKey;

  const [currentPage, setCurrentPage] = useState(1);

  // Reset when list length changes or when filters/search keys change
  useEffect(() => {
    setCurrentPage(1);
  }, [dataArray?.length, resetKey]);

  const totalRecords = dataArray?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize) || 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedData = useMemo(() => {
    if (!dataArray || !Array.isArray(dataArray)) return [];
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return dataArray.slice(startIndex, startIndex + pageSize);
  }, [dataArray, safeCurrentPage, pageSize]);

  const startRecord = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, totalRecords);

  const nextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToPage = (page) => setCurrentPage(Math.min(Math.max(1, Number(page) || 1), totalPages));

  return {
    currentPage: safeCurrentPage,
    totalPages,
    totalRecords,
    pageSize,
    startRecord,
    endRecord,
    paginatedData,
    nextPage,
    prevPage,
    goToPage,
    setCurrentPage: goToPage,
  };
}

/**
 * Server-driven pagination state (no client slicing).
 * Pair with API calls that accept page/limit and return total.
 */
export function useServerPagination({
  totalRecords = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey,
} = {}) {
  const [currentPage, setCurrentPage] = useState(1);
  const size = Number(pageSize) > 0 ? Number(pageSize) : DEFAULT_PAGE_SIZE;
  const total = Number(totalRecords) || 0;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startRecord = total === 0 ? 0 : (safeCurrentPage - 1) * size + 1;
  const endRecord = Math.min(safeCurrentPage * size, total);

  const goToPage = (page) => setCurrentPage(Math.min(Math.max(1, Number(page) || 1), totalPages));

  return {
    currentPage: safeCurrentPage,
    totalPages,
    totalRecords: total,
    pageSize: size,
    startRecord,
    endRecord,
    nextPage: () => setCurrentPage((prev) => Math.min(prev + 1, totalPages)),
    prevPage: () => setCurrentPage((prev) => Math.max(prev - 1, 1)),
    goToPage,
    setCurrentPage: goToPage,
  };
}
