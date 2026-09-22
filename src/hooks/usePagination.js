import { useState, useMemo, useEffect } from 'react';

export function usePagination(dataArray, pageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);

  // If the underlying data changes significantly, reset to page 1 to avoid being trapped on an empty page
  useEffect(() => {
    setCurrentPage(1);
  }, [dataArray?.length]);

  const totalRecords = dataArray?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  // Ensure current page is within valid bounds
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedData = useMemo(() => {
    if (!dataArray || !Array.isArray(dataArray)) return [];
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return dataArray.slice(startIndex, startIndex + pageSize);
  }, [dataArray, safeCurrentPage, pageSize]);

  const nextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const prevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToPage = (page) => setCurrentPage(Math.min(Math.max(1, page), totalPages));

  return {
    currentPage: safeCurrentPage,
    totalPages,
    totalRecords,
    paginatedData,
    nextPage,
    prevPage,
    goToPage
  };
}
