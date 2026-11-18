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
    const supName = product.supplier_name || suppliers.find((s) => String(s.suppliers_id) === String(product.supplier_id))?.supplier_name || '';

    setLines((prev) => {
      if (prev.some((line) => String(line.product_id) === String(initialProductId))) return prev;
      return [{
        product_id: Number(product.product_id),
        product_name: product.product_name,
        sku: product.sku,
        supplier_id: product.supplier_id,
        supplier_name: supName,
        on_hand: onHandByProduct.get(Number(product.product_id)) || 0,
        quantity: '1',
      }];
    });

    if (!initialSupplierId && product.supplier_id && suppliers.length) {
      const match = suppliers.find((s) => String(s.suppliers_id) === String(product.supplier_id));
      if (match) {
        setForm((prev) => ({ ...prev, supplierId: String(match.suppliers_id) }));
        setSupplierPrefillNote('');
        setErrors((prev) => {
          const next = { ...prev };
          delete next.supplierId;
          return next;
        });
      } else {
        setSupplierPrefillNote(
          `The supplier for "${product.product_name}" is inactive or unavailable. Choose another Active supplier to continue.`
        );
      }
    }
  }, [initialProductId, initialSupplierId, products, suppliers, onHandByProduct]);

  useEffect(() => {
    if (!initialSupplierId || loading || !suppliers.length) return;
    const match = suppliers.find((s) => String(s.suppliers_id) === String(initialSupplierId));
    if (match) {
      setForm((prev) => ({ ...prev, supplierId: String(match.suppliers_id) }));
      setSupplierPrefillNote('');
      setErrors((prev) => {
        const next = { ...prev };
        delete next.supplierId;
        return next;
      });
      return;
    }
    setForm((prev) => ({ ...prev, supplierId: '' }));
    setSupplierPrefillNote('The selected supplier is inactive or unavailable. Choose another Active supplier to continue.');
    setErrors((prev) => ({ ...prev, supplierId: 'Select an Active supplier.' }));
  }, [initialSupplierId, suppliers, loading]);

  const availableOptions = useMemo(() => {
    const unselected = products.filter(
      (p) => !lines.some((line) => Number(line.product_id) === Number(p.product_id))
    );
    if (!form.supplierId) return unselected;
    return [...unselected].sort((a, b) => {
      const aMatches = String(a.supplier_id) === String(form.supplierId) ? 1 : 0;
      const bMatches = String(b.supplier_id) === String(form.supplierId) ? 1 : 0;
      return bMatches - aMatches;
    });
  }, [products, lines, form.supplierId]);

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

    const supName = product.supplier_name || suppliers.find((s) => String(s.suppliers_id) === String(product.supplier_id))?.supplier_name || '';

    // Automatically identify and display the supplier to which this product specifically belongs
    if (product.supplier_id) {
      const targetSupplierId = String(product.supplier_id);
      const matchedSupplier = suppliers.find((s) => String(s.suppliers_id) === targetSupplierId);

      // Prevent mixing products from different suppliers on one restock receipt
      if (lines.length > 0 && form.supplierId && String(form.supplierId) !== targetSupplierId) {
        const currentSupplier = suppliers.find((s) => String(s.suppliers_id) === String(form.supplierId));
        const currentName = currentSupplier?.supplier_name || 'the current supplier';
        const newSupplierName = matchedSupplier?.supplier_name || supName || 'another supplier';
        showToast(
          `"${product.product_name}" belongs to ${newSupplierName}. This restock is for ${currentName}. Each restock receipt must be from a single supplier.`,
          'error'
        );
        return;
      }

      if (matchedSupplier) {
        setForm((prev) => ({ ...prev, supplierId: targetSupplierId }));
        setSupplierPrefillNote('');
        setErrors((prev) => {
          const next = { ...prev };
          delete next.supplierId;
          return next;
        });
      } else {
        setSupplierPrefillNote(
          `The supplier for "${product.product_name}" (${supName || 'ID ' + product.supplier_id}) is inactive or unavailable. Please choose an Active supplier.`
        );
      }
    }

    setLines((prev) => [...prev, {
      product_id: Number(product.product_id),
      product_name: product.product_name,
      sku: product.sku,
      supplier_id: product.supplier_id,
      supplier_name: supName,
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
    setLines((prev) => {
      const next = prev.filter((line) => Number(line.product_id) !== Number(productId));
      if (next.length === 0) {
        // No lines left – clear supplier selection and related notes/errors
        setForm((p) => ({ ...p, supplierId: '' }));
        setSupplierPrefillNote('');
        setErrors((prevErr) => {
          const nextErr = { ...prevErr };
          delete nextErr.supplierId;
          return nextErr;
        });
      }
      return next;
    });
  };

  const saveRestock = async ({ submit }) => {
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

    if (submit && (totals.lineCount >= 5 || totals.totalUnits >= 50)) {
      const ok = window.confirm(
        `Submit restock for ${user?.branch?.name || 'your branch'}?\n\n`
        + `${totals.lineCount} product line(s), +${totals.totalUnits} total units.\n\n`
        + 'Stock will NOT increase until a Branch Manager approves this restock.'
      );
      if (!ok) return;
    }

    setSubmitting(true);
    const result = await createRestock({
      supplier_id: Number(form.supplierId),
      received_date: form.dateReceived,
      notes: form.notes.trim(),
      lines: normalized,
      submit: Boolean(submit),
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Restock failed.', 'error');
      return;
    }
    showToast(
      result.message
        || (submit
          ? 'Restock submitted for approval.'
          : 'Restock draft saved.'),
      'success'
    );
    const id = result.data?.restock_id;
    navigate(id ? `/warehouse/restock-history/${id}` : '/warehouse/restock-history');
  };

  if (loading) return <LoadingState message="Loading restock form…" />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <h3 style={{ marginTop: 0 }}>New Restock</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          Save a draft or submit for Branch Manager approval. On-hand stock increases only after approval.
        </p>

        <div className="form-group">
          <label>Supplier<span className="required">*</span></label>
          <select
            className="filter-select"
            value={form.supplierId}
            onChange={(e) => {
              const newSupplierId = e.target.value;
              if (lines.length > 0 && newSupplierId) {
                const mismatched = lines.find((l) => l.supplier_id && String(l.supplier_id) !== String(newSupplierId));
                if (mismatched) {
                  showToast(
                    `Existing line "${mismatched.product_name}" belongs to ${mismatched.supplier_name || 'another supplier'}. Remove it first to switch suppliers.`,
                    'error'
                  );
                  return;
                }
              }
              setForm((p) => ({ ...p, supplierId: newSupplierId }));
              setSupplierPrefillNote('');
              setErrors((prev) => {
                const next = { ...prev };
                delete next.supplierId;
                return next;
              });
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
                          <td>
                            <strong>{line.product_name}</strong>
                            {line.supplier_name ? (
                              <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                                {line.supplier_name}
                              </div>
                            ) : null}
                          </td>
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
                          <td style={{ fontWeight: 600 }} title="Projected after BM approval">{line.on_hand + qty}</td>
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
        <button
          className="button secondary"
          type="button"
          onClick={() => saveRestock({ submit: false })}
          disabled={submitting || !lines.length}
        >
          {submitting ? 'Saving…' : 'Save draft'}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => saveRestock({ submit: true })}
          disabled={submitting || !lines.length}
        >
          {submitting ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>
    </div>
  );
}
