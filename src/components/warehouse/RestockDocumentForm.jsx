import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient.js';
import { createRestock, fetchBranchInventory } from '../../api/inventoryService.js';
import { getCurrentUser } from '../../api/authService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import { NavIcon } from '../../navIcons';
import { ProductSearchSelect } from './ProductSearchSelect.jsx';

/**
 * Multi-product goods receipt form.
 * Optional prefills: initialProductId from product detail shortcut.
 * Duplicate products are blocked (not merged).
 */
export function RestockDocumentForm({
  navigate,
  showToast,
  initialProductId = '',
  initialSupplierId = '',
  cancelTo = '/warehouse/restock-history',
}) {
  const user = getCurrentUser();
  const [products, setProducts] = useState([]);
  const [branchStock, setBranchStock] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    supplierId: '',
    dateReceived: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [lines, setLines] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [supplierPrefillNote, setSupplierPrefillNote] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prodRes, invRes, supRes] = await Promise.all([
          apiClient.get('/products', { params: { product_status: 'Active', limit: 500 } }),
          fetchBranchInventory(),
          apiClient.get('/suppliers', { params: { status: 'Active', limit: 200 } }),
        ]);
        if (prodRes.data?.success) setProducts(prodRes.data.data || []);
        if (invRes.success) setBranchStock(invRes.data || []);
        if (supRes.data?.success) setSuppliers(supRes.data.data || []);
      } catch {
        showToast?.('Failed to load restock form data.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);

  const onHandByProduct = useMemo(() => {
    const map = new Map();
    branchStock.forEach((row) => {
      map.set(Number(row.product_id), Number(row.available_stock ?? 0));
    });
    return map;
  }, [branchStock]);

  useEffect(() => {
    if (!initialProductId || !products.length) return;
    const product = products.find((p) => String(p.product_id) === String(initialProductId));
    if (!product) return;
    setLines((prev) => {
      if (prev.some((line) => String(line.product_id) === String(initialProductId))) return prev;
      return [{
        product_id: Number(product.product_id),
        product_name: product.product_name,
        sku: product.sku,
        on_hand: onHandByProduct.get(Number(product.product_id)) || 0,
        quantity: '1',
      }];
    });
  }, [initialProductId, products, onHandByProduct]);

  useEffect(() => {
    if (!initialSupplierId || loading) return;
    const match = suppliers.find((s) => String(s.suppliers_id) === String(initialSupplierId));
    if (match) {
      setForm((prev) => {
        if (prev.supplierId && String(prev.supplierId) !== String(initialSupplierId)) return prev;
        return { ...prev, supplierId: String(match.suppliers_id) };
      });
      setSupplierPrefillNote('');
      return;
    }
    setForm((prev) => {
      if (prev.supplierId && String(prev.supplierId) !== String(initialSupplierId)) return prev;
      return { ...prev, supplierId: '' };
    });
    setSupplierPrefillNote('The selected supplier is inactive or unavailable. Choose another Active supplier to continue.');
    setErrors((prev) => ({ ...prev, supplierId: 'Select an Active supplier.' }));
  }, [initialSupplierId, suppliers, loading]);

  const availableOptions = useMemo(
    () => products.filter((p) => !lines.some((line) => Number(line.product_id) === Number(p.product_id))),
    [products, lines]
  );

  const totals = useMemo(() => {
    const totalUnits = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    return { lineCount: lines.length, totalUnits };
  }, [lines]);

  const addProduct = (product) => {
    if (!product) return;
    if (lines.some((line) => Number(line.product_id) === Number(product.product_id))) {
      showToast('That product is already on this restock.', 'error');
      return;
    }
    setLines((prev) => [...prev, {
      product_id: Number(product.product_id),
      product_name: product.product_name,
      sku: product.sku,
      on_hand: onHandByProduct.get(Number(product.product_id)) || 0,
      quantity: '1',
    }]);
  };

  const updateQty = (productId, quantity) => {
    setLines((prev) => prev.map((line) => (
      Number(line.product_id) === Number(productId) ? { ...line, quantity } : line
    )));
  };

  const removeLine = (productId) => {
    setLines((prev) => prev.filter((line) => Number(line.product_id) !== Number(productId)));
  };

  const handleSubmit = async () => {
    const nextErrors = {};
    const activeSupplier = suppliers.find((s) => String(s.suppliers_id) === String(form.supplierId));
    if (!form.supplierId) nextErrors.supplierId = 'Supplier is required.';
    else if (!activeSupplier) nextErrors.supplierId = 'Select an Active supplier. Inactive or archived suppliers cannot be used.';
    if (!form.dateReceived) nextErrors.dateReceived = 'Date received is required.';
    if (!lines.length) nextErrors.lines = 'Add at least one product.';
    const normalized = [];
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) {
        nextErrors.lines = `Enter a positive quantity for ${line.product_name}.`;
        break;
      }
      normalized.push({ product_id: line.product_id, quantity: qty });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }

    if (totals.lineCount >= 5 || totals.totalUnits >= 50) {
      const ok = window.confirm(
        `Record restock for ${user?.branch?.name || 'your branch'}?\n\n`
        + `${totals.lineCount} product line(s), +${totals.totalUnits} total units.\n\n`
        + 'Stock will increase immediately when you confirm.'
      );
      if (!ok) return;
    }

    setSubmitting(true);
    const result = await createRestock({
      supplier_id: Number(form.supplierId),
      received_date: form.dateReceived,
      notes: form.notes.trim(),
      lines: normalized,
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Restock failed.', 'error');
      return;
    }
    showToast(result.message || 'Restock recorded.', 'success');
    const id = result.data?.restock_id;
    navigate(id ? `/warehouse/restock-history/${id}` : '/warehouse/restock-history');
  };

  if (loading) return <LoadingState message="Loading restock form…" />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <h3 style={{ marginTop: 0 }}>New Restock</h3>

        <div className="form-group">
          <label>Supplier<span className="required">*</span></label>
          <select
            className="filter-select"
            value={form.supplierId}
            onChange={(e) => {
              setForm((p) => ({ ...p, supplierId: e.target.value }));
              setSupplierPrefillNote('');
            }}
          >
            <option value="">Select Active supplier</option>
            {suppliers.map((s) => (
              <option key={s.suppliers_id} value={s.suppliers_id}>{s.supplier_name}</option>
            ))}
          </select>
          {supplierPrefillNote ? <p className="form-error">{supplierPrefillNote}</p> : null}
          {errors.supplierId ? <p className="form-error">{errors.supplierId}</p> : null}
        </div>

        <div className="form-group">
          <label>Date received<span className="required">*</span></label>
          <input
            className="filter-input"
            type="date"
            value={form.dateReceived}
            onChange={(e) => setForm((p) => ({ ...p, dateReceived: e.target.value }))}
          />
          {errors.dateReceived ? <p className="form-error">{errors.dateReceived}</p> : null}
        </div>

        <div className="form-group">
          <label>Products<span className="required">*</span></label>
          <div style={{ marginBottom: 10 }}>
            <ProductSearchSelect
              options={availableOptions}
              onSelect={addProduct}
              placeholder="Search product or SKU…"
              emptyLabel="No matching products"
              disabled={!products.length}
            />
          </div>
          {errors.lines ? <p className="form-error">{errors.lines}</p> : null}

          {lines.length ? (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Current on hand</th>
                      <th>Qty received</th>
                      <th>After</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const qty = Number(line.quantity) || 0;
                      return (
                        <tr key={line.product_id}>
                          <td><strong>{line.product_name}</strong></td>
                          <td><span className="mono-cell">{line.sku || '—'}</span></td>
                          <td>{line.on_hand}</td>
                          <td style={{ minWidth: 140 }}>
                            <QuantityStepper
                              value={line.quantity}
                              min={1}
                              onChange={(next) => updateQty(line.product_id, next)}
                              aria-label={`Quantity for ${line.product_name}`}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>{line.on_hand + qty}</td>
                          <td>
                            <button className="icon-action-button danger" type="button" title="Remove" onClick={() => removeLine(line.product_id)}>
                              <NavIcon name="close" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-ink/70" style={{ marginTop: 8, fontSize: '0.85rem' }}>
                {totals.lineCount} line{totals.lineCount === 1 ? '' : 's'} · +{totals.totalUnits} total units
              </p>
            </>
          ) : (
            <EmptyState title="No products yet" description="Search and select a product to add." />
          )}
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Optional notes"
          />
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(cancelTo)} disabled={submitting}>
          Cancel
        </button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting || !lines.length}>
          {submitting ? 'Saving…' : 'Record restock'}
        </button>
      </div>
    </div>
  );
}
