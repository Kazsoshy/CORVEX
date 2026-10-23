import { useCallback, useState } from 'react';
import { fetchChartDetails } from '../api/reportsService.js';
import { formatCurrency } from '../utils/formatters.js';

const DEFAULT_COLUMNS = {
  collection: [
    { key: 'receipt_number', label: 'Receipt' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'collector_name', label: 'Collector' },
    { key: 'payment_date', label: 'Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'payment_method', label: 'Method' },
    { key: 'status', label: 'Status' },
    { key: 'branch_name', label: 'Branch' },
  ],
  sales: [
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'sales_agent_name', label: 'Agent' },
    { key: 'invoices_date', label: 'Date' },
    { key: 'total_amount', label: 'Amount' },
    { key: 'status', label: 'Status' },
    { key: 'branch_name', label: 'Branch' },
  ],
  inventory: [
    { key: 'product_name', label: 'Product' },
    { key: 'sku', label: 'SKU' },
    { key: 'available_stock', label: 'Stock' },
    { key: 'reorder_level', label: 'Reorder' },
    { key: 'status', label: 'Status' },
    { key: 'branch_name', label: 'Branch' },
  ],
  customers: [
    { key: 'customer_name', label: 'Customer' },
    { key: 'outstanding_balance', label: 'Outstanding' },
    { key: 'last_collection_date', label: 'Last collection' },
    { key: 'earliest_due_date', label: 'Earliest due' },
    { key: 'branch_name', label: 'Branch' },
    { key: 'status', label: 'Status' },
  ],
  saw: [
    { key: 'ranking', label: 'Rank' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'branch_name', label: 'Branch' },
    { key: 'score', label: 'Score' },
    { key: 'outstanding_balance', label: 'Balance' },
    { key: 'days_overdue', label: 'Days overdue' },
  ],
  staff: [
    { key: 'name', label: 'Name' },
    { key: 'complianceScore', label: 'Compliance %' },
    { key: 'recoveryRate', label: 'Recovery %' },
    { key: 'visitCompletionRate', label: 'Visit %' },
    { key: 'conversionRate', label: 'Conversion %' },
    { key: 'status', label: 'Status' },
  ],
};

function formatMoneyTotals(totals = []) {
  return totals.map((t) => {
    const numeric = Number(t.value);
    if (String(t.label || '').toLowerCase().includes('amount')
      || String(t.label || '').toLowerCase().includes('outstanding')
      || String(t.label || '').toLowerCase().includes('total amount')) {
      return { ...t, value: Number.isFinite(numeric) ? formatCurrency(numeric) : t.value };
    }
    if (String(t.label || '').toLowerCase().includes('outstanding') && Number.isFinite(numeric)) {
      return { ...t, value: formatCurrency(numeric) };
    }
    return t;
  }).map((t) => {
    if (String(t.label || '').toLowerCase() === 'outstanding' && typeof t.value === 'number') {
      return { ...t, value: formatCurrency(t.value) };
    }
    return t;
  });
}

function formatRowMoney(rows, keys = ['amount', 'total_amount', 'outstanding_balance']) {
  return rows.map((row) => {
    const next = { ...row };
    keys.forEach((key) => {
      if (next[key] != null && next[key] !== '') {
        const n = Number(next[key]);
        if (Number.isFinite(n)) next[key] = formatCurrency(n);
      }
    });
    if (next.score != null && Number.isFinite(Number(next.score))) {
      next.score = Number(next.score).toFixed(3);
    }
    return next;
  });
}

/**
 * Shared chart click → details modal state for Sales / BM / OM.
 */
export function useChartDrilldown({ showToast } = {}) {
  const [state, setState] = useState({
    open: false,
    loading: false,
    error: '',
    title: '',
    category: '',
    dateRange: '',
    subtitle: '',
    columns: [],
    rows: [],
    totals: [],
    legend: [],
    filenameBase: 'chart-details',
  });

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false, loading: false }));
  }, []);

  const openLocal = useCallback((payload) => {
    const columnSet = payload.columns || DEFAULT_COLUMNS[payload.columnSet] || [];
    setState({
      open: true,
      loading: false,
      error: '',
      title: payload.title || 'Chart details',
      category: payload.category || '',
      dateRange: payload.dateRange || '',
      subtitle: payload.subtitle || 'Click a chart element to inspect matching records.',
      columns: columnSet,
      rows: formatRowMoney(payload.rows || []),
      totals: formatMoneyTotals(payload.totals || []),
      legend: payload.legend || [],
      filenameBase: payload.filenameBase || 'chart-details',
    });
  }, []);

  const openFromApi = useCallback(async (params, extras = {}) => {
    setState((prev) => ({
      ...prev,
      open: true,
      loading: true,
      error: '',
      title: extras.title || 'Chart details',
      category: extras.category || '',
      dateRange: extras.dateRange || '',
      subtitle: extras.subtitle || 'Loading matching records…',
      columns: extras.columns || DEFAULT_COLUMNS[extras.columnSet] || [],
      rows: [],
      totals: [],
      legend: extras.legend || [],
      filenameBase: extras.filenameBase || params.type || 'chart-details',
    }));
    const result = await fetchChartDetails(params);
    if (!result.success || !result.data) {
      const message = result.message || 'Failed to load chart details.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      showToast?.(message, 'error');
      return;
    }
    const data = result.data;
    setState((prev) => ({
      ...prev,
      loading: false,
      error: '',
      title: extras.title || data.title || prev.title,
      category: extras.category || data.category || prev.category,
      dateRange: extras.dateRange || data.dateRange || prev.dateRange,
      subtitle: extras.subtitle || 'Records matching the selected chart element.',
      columns: extras.columns || DEFAULT_COLUMNS[extras.columnSet] || prev.columns,
      rows: formatRowMoney(data.rows || []),
      totals: formatMoneyTotals(data.totals || []),
      legend: extras.legend || prev.legend,
    }));
  }, [showToast]);

  return { drilldown: state, closeDrilldown: close, openLocalDrilldown: openLocal, openApiDrilldown: openFromApi };
}
