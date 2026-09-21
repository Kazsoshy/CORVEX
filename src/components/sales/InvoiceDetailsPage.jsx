import { useEffect, useState } from 'react';
import { fetchInvoiceById, fetchInvoiceItems } from '../../api/salesService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { formatCurrency } from '../../data/salesMockData';
import { NavIcon } from '../../navIcons';

export function InvoiceDetailsPage({ invoiceId, navigate, showToast }) {
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

  if (loading) return <LoadingState message="Loading invoice details..." />;

  if (error && !invoice && !items.length) {
    return (
      <EmptyState
        title="Unable to load invoice"
        description={error}
        actionLabel="Back to History"
        onAction={() => navigate('/sales/history')}
      />
    );
  }

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
  const headerTotal = Number(invoice?.total_amount || 0);

  const customerName = invoice?.customer_name || `${invoice?.first_name || ''} ${invoice?.last_name || ''}`.trim() || '—';

  return (
    <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>{invoice?.invoice_number ? `Invoice #${invoice.invoice_number}` : 'Invoice Details'}</h3>
          <p className="text-ink/70">Invoice ID: {invoice?.sales_invoices_id ?? invoiceId}</p>
        </div>

        {invoice ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Invoice Number</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.invoice_number || '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Customer</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{customerName}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Amount</span>
              <strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{formatCurrency(headerTotal)}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Branch</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.branch_name || '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Payment Method</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.payment_method || '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Status</span>
              <span style={{ display: 'block', marginTop: 4 }}><StatusBadge status={invoice.status} /></span>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Invoice Date</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.invoices_date ? new Date(invoice.invoices_date).toLocaleDateString('en-PH') : '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Due Date</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-PH') : '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sales Agent</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: 4 }}>{invoice.sales_agent_name || '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Created</span>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginTop: 4 }}>{invoice.created_at ? new Date(invoice.created_at).toLocaleString() : '—'}</strong>
            </div>
            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Updated</span>
              <strong style={{ display: 'block', fontSize: '1.05rem', marginTop: 4 }}>{invoice.updated_at ? new Date(invoice.updated_at).toLocaleString() : '—'}</strong>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#4d7302', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Items</span>
                <strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{items.length}</strong>
              </div>
              <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#4d7302', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Quantity</span>
                <strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{totalQuantity}</strong>
              </div>
              <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#4d7302', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Items Total</span>
                <strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{formatCurrency(totalAmount)}</strong>
              </div>
            </div>

            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Invoice ID</th>
                    <th>Product ID</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.sales_invoices_items_id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.sales_invoices_items_id}</span></td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.invoice_id}</span></td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.product_id}</span></td>
                      <td>{item.product_name || '—'}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.sku || '—'}</span></td>
                      <td>{item.quantity}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(item.unit_price))}</td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(Number(item.line_total))}</td>
                      <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-PH') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="No invoice items found" description="This invoice has no line items." />
        )}
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/history')}>Back to History</button>
      </div>
    </div>
  );
}

