import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useState } from 'react';
import { fetchInvoiceById, fetchInvoiceItems } from '../../api/salesService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';

const sectionStyle = {
  marginBottom: 4,
};

const itemsTableShellStyle = {
  maxHeight: 280,
  overflow: 'auto',
  border: '1px solid var(--border, #BADBE9)',
  borderRadius: 8,
};

export function InvoiceDetailsPage({
  invoiceId,
  navigate,
  showToast,
  historyBasePath = '/sales/history',
  onBack,
  embedded = false,
}) {
  const handleBack = () => {
    if (typeof onBack === 'function') onBack();
    else navigate(historyBasePath);
  };
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      if (!invoiceId) {
        setError('No invoice id provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const headerRes = await fetchInvoiceById(invoiceId);
      const itemsRes = await fetchInvoiceItems(invoiceId);
      if (headerRes.success) {
        setInvoice(headerRes.data);
      } else {
        setError(headerRes.message || 'Failed to load invoice header.');
        if (showToast) showToast('Failed to load invoice details', 'error');
      }
      if (itemsRes.success) {
        setItems(itemsRes.data || []);
      } else if (showToast) {
        showToast('Failed to load invoice items', 'error');
      }
      setLoading(false);
    }
    load();
  }, [invoiceId, showToast]);

  const pagination_items = usePagination(items);
  const paginated_items = embedded ? items : pagination_items.paginatedData;

  if (loading) return <LoadingState message="Loading invoice details..." />;
  if (error && !invoice && !items.length) {
    return (
      <EmptyState
        title="Unable to load invoice"
        description={error}
        actionLabel={embedded ? 'Close' : 'Back to History'}
        onAction={handleBack}
      />
    );
  }

  const itemsSubtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const headerTotal = Number(invoice?.total_amount || 0);
  const customerName = invoice?.customer_name || `${invoice?.first_name || ''} ${invoice?.last_name || ''}`.trim() || '—';
  const notesText = String(invoice?.notes ?? '').trim();

  const invoiceInfoRows = invoice
    ? [
        { label: 'Invoice Number', value: invoice.invoice_number || '—' },
        { label: 'Invoice Date', value: formatDisplayDate(invoice.invoices_date) },
        { label: 'Due Date', value: formatDisplayDate(invoice.due_date) },
        { label: 'Status', value: <StatusBadge status={invoice.status} /> },
        { label: 'Branch', value: invoice.branch_name || '—' },
        { label: 'Sales Agent', value: invoice.sales_agent_name || '—' },
        { label: 'Created', value: formatDisplayDateTime(invoice.created_at) },
      ]
    : [];

  const customerInfoRows = invoice
    ? [
        { label: 'Customer Name', value: customerName },
        { label: 'Customer ID', value: invoice.customer_id ?? '—' },
        { label: 'Branch', value: invoice.branch_name || '—' },
        { label: 'Notes', value: notesText || '—' },
      ]
    : [];

  const paymentSummaryRows = [
    { label: 'Items Subtotal', value: formatCurrency(itemsSubtotal) },
    { label: 'Invoice Total', value: <strong>{formatCurrency(headerTotal)}</strong> },
    { label: 'Payment Method', value: invoice?.payment_method || '—' },
    { label: 'Payment Status', value: invoice?.status ? <StatusBadge status={invoice.status} /> : '—' },
    { label: 'Due Date', value: formatDisplayDate(invoice?.due_date) },
  ];

  const content = (
    <>
      {invoice ? (
        <>
          <section style={sectionStyle}>
            <h4 className="subsection-title">Invoice Information</h4>
            <DetailRowsTable rows={invoiceInfoRows} />
          </section>

          <section style={sectionStyle}>
            <h4 className="subsection-title">Customer Information</h4>
            <DetailRowsTable rows={customerInfoRows} />
          </section>
        </>
      ) : (
        <EmptyState title="Invoice not found" description="The invoice header could not be loaded." />
      )}

      <section style={sectionStyle}>
        <h4 className="subsection-title">Invoice Items</h4>
        <p className="list-section-subtitle muted" style={{ marginBottom: 10 }}>
          {items.length
            ? `${items.length} item${items.length === 1 ? '' : 's'} · Qty ${totalQuantity}`
            : 'Line items for this invoice'}
        </p>

        {items.length > 0 ? (
          <>
            <div
              className="corvex-table-wrapper"
              style={embedded ? itemsTableShellStyle : undefined}
            >
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_items.map((item) => (
                    <tr key={item.sales_invoices_items_id}>
                      <td>{item.product_name || '—'}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {item.sku || '—'}
                        </span>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(Number(item.unit_price))}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!embedded ? <Pagination {...pagination_items} /> : null}
          </>
        ) : (
          <EmptyState title="No invoice items found" description="This invoice has no line items." />
        )}
      </section>

      <section style={sectionStyle}>
        <h4 className="subsection-title">Payment Summary</h4>
        <DetailRowsTable rows={paymentSummaryRows} />
      </section>

      <div className={embedded ? 'modal-actions' : 'flex justify-end mt-4'}>
        <button className="button ghost" type="button" onClick={handleBack}>
          {embedded ? 'Close' : 'Back to History'}
        </button>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="grid gap-[18px] w-full">
        <div className="modal-header">
          <div>
            <h3>{invoice?.invoice_number ? `Invoice #${invoice.invoice_number}` : 'Invoice Details'}</h3>
            <p className="list-section-subtitle muted" style={{ margin: '4px 0 0' }}>
              Invoice ID: {invoice?.sales_invoices_id ?? invoiceId}
            </p>
          </div>
          <button className="button ghost" type="button" onClick={handleBack} aria-label="Close">
            Close
          </button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>{invoice?.invoice_number ? `Invoice #${invoice.invoice_number}` : 'Invoice Details'}</h3>
            <p className="list-section-subtitle muted">
              Invoice ID: {invoice?.sales_invoices_id ?? invoiceId}
            </p>
          </div>
        </div>
        {content}
      </section>
    </div>
  );
}
