import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient.js';
import { createRestock, fetchBranchInventory } from '../../api/inventoryService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import { NavIcon } from '../../navIcons';

/**
 * Multi-product goods receipt form.
 * Supplier is selected first; product list is limited to that supplier.
 * Optional prefills: initialProductId / initialSupplierId from shortcuts.
 * Duplicate products are blocked (not merged).
 */
export function RestockDocumentForm({
  navigate,
  showToast,
  initialProductId = '',
  initialSupplierId = '',
  cancelTo = '/warehouse/restock-history',
}) {
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
  const [confirmAction, setConfirmAction] = useState(null); // 'draft' | 'submit' | null
  const [supplierPrefillNote, setSupplierPrefillNote] = useState('');
  const [productSelectValue, setProductSelectValue] = useState('');

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

  const resolveSupplierName = (product) => (
    product?.supplier_name
    || suppliers.find((s) => String(s.suppliers_id) === String(product?.supplier_id))?.supplier_name
    || ''
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => String(s.suppliers_id) === String(form.supplierId)) || null,
    [suppliers, form.supplierId]
  );

  /** Products assigned to the currently selected supplier (from DB-backed product.supplier_id). */
  const supplierProducts = useMemo(() => {
    if (!form.supplierId) return [];
    return products.filter((p) => String(p.supplier_id) === String(form.supplierId));
  }, [products, form.supplierId]);

  const availableOptions = useMemo(
    () => supplierProducts.filter(
      (p) => !lines.some((line) => Number(line.product_id) === Number(p.product_id))
    ),
    [supplierProducts, lines]
  );

  useEffect(() => {
    if (!initialProductId || !products.length) return;
    const product = products.find((p) => String(p.product_id) === String(initialProductId));
    if (!product) return;

    if (!initialSupplierId && product.supplier_id && suppliers.length) {
      const match = suppliers.find((s) => String(s.suppliers_id) === String(product.supplier_id));
      if (match) {
        setForm((prev) => (prev.supplierId ? prev : { ...prev, supplierId: String(match.suppliers_id) }));
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
        return;
      }
    }

    const supplierForLine = initialSupplierId || product.supplier_id;
    if (supplierForLine && String(product.supplier_id) !== String(supplierForLine)) return;

    setLines((prev) => {
      if (prev.some((line) => String(line.product_id) === String(initialProductId))) return prev;
      return [{
        product_id: Number(product.product_id),
        product_name: product.product_name,
        sku: product.sku,
        supplier_id: product.supplier_id,
        supplier_name: resolveSupplierName(product),
        on_hand: onHandByProduct.get(Number(product.product_id)) || 0,
        quantity: '1',
      }];
    });
    // resolveSupplierName depends on suppliers; listed via suppliers in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const totals = useMemo(() => {
    const totalUnits = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    return { lineCount: lines.length, totalUnits };
  }, [lines]);

  const onSupplierChange = (newSupplierId) => {
    if (lines.length > 0) {
      const mismatched = lines.find(
        (l) => l.supplier_id && String(l.supplier_id) !== String(newSupplierId)
      );
      if (mismatched || !newSupplierId) {
        showToast(
          newSupplierId
            ? `Existing line "${mismatched.product_name}" belongs to ${mismatched.supplier_name || 'another supplier'}. Remove product lines first to switch suppliers.`
            : 'Remove product lines before clearing the supplier.',
          'error'
        );
        return;
      }
    }

    setForm((p) => ({ ...p, supplierId: newSupplierId }));
    setProductSelectValue('');
    setSupplierPrefillNote('');
    setErrors((prev) => {
      const next = { ...prev };
      delete next.supplierId;
      delete next.lines;
      return next;
    });
  };

  const addProduct = (product) => {
    if (!product) return;
    if (!form.supplierId) {
      showToast('Select an Active supplier before adding products.', 'error');
      setProductSelectValue('');
      return;
    }
    if (String(product.supplier_id) !== String(form.supplierId)) {
      showToast(
        `"${product.product_name}" does not belong to the selected supplier.`,
        'error'
      );
      setProductSelectValue('');
      return;
    }
    if (lines.some((line) => Number(line.product_id) === Number(product.product_id))) {
      showToast('That product is already on this restock.', 'error');
      setProductSelectValue('');
      return;
    }

    setLines((prev) => [...prev, {
      product_id: Number(product.product_id),
      product_name: product.product_name,
      sku: product.sku,
      supplier_id: product.supplier_id,
      supplier_name: resolveSupplierName(product) || selectedSupplier?.supplier_name || '',
      on_hand: onHandByProduct.get(Number(product.product_id)) || 0,
      quantity: '1',
    }]);
    setProductSelectValue('');
    setErrors((prev) => {
      const next = { ...prev };
      delete next.lines;
      return next;
    });
  };

  const onProductSelect = (productId) => {
    setProductSelectValue(productId);
    if (!productId) return;
    const product = availableOptions.find((p) => String(p.product_id) === String(productId));
    if (!product) {
      showToast('That product is not available for the selected supplier.', 'error');
      setProductSelectValue('');
      return;
    }
    addProduct(product);
  };

  const updateQty = (productId, quantity) => {
    setLines((prev) => prev.map((line) => (
      Number(line.product_id) === Number(productId) ? { ...line, quantity } : line
    )));
  };

  const removeLine = (productId) => {
    setLines((prev) => prev.filter((line) => Number(line.product_id) !== Number(productId)));
  };

  const validateRestock = () => {
    const nextErrors = {};
    const activeSupplier = suppliers.find((s) => String(s.suppliers_id) === String(form.supplierId));
    if (!form.supplierId) nextErrors.supplierId = 'Supplier is required.';
    else if (!activeSupplier) nextErrors.supplierId = 'Select an Active supplier. Inactive or archived suppliers cannot be used.';
    if (!form.dateReceived) nextErrors.dateReceived = 'Date received is required.';
    if (!lines.length) nextErrors.lines = 'Add at least one product.';

    const normalized = [];
    for (const line of lines) {
      if (String(line.supplier_id) !== String(form.supplierId)) {
        nextErrors.lines = `"${line.product_name}" does not belong to the selected supplier.`;
        break;
      }
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
      return null;
    }
    return normalized;
  };

  const openConfirm = (action) => {
    if (submitting) return;
    const normalized = validateRestock();
    if (!normalized) return;
    setConfirmAction(action);
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirmAction(null);
  };

  const confirmSaveRestock = async () => {
    if (submitting || !confirmAction) return;
    const submit = confirmAction === 'submit';
    const normalized = validateRestock();
    if (!normalized) {
      setConfirmAction(null);
      return;
    }

    setSubmitting(true);
    const result = await createRestock({
      supplier_id: Number(form.supplierId),
      received_date: form.dateReceived,
      notes: form.notes.trim(),
      lines: normalized,
      submit,
    });
    setSubmitting(false);

    if (!result.success) {
      showToast(result.message || 'Restock failed.', 'error');
      return;
    }

    setConfirmAction(null);
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

  const productPlaceholder = !form.supplierId
    ? 'Select a supplier first'
    : supplierProducts.length === 0
      ? 'No products available for this supplier.'
      : availableOptions.length === 0
        ? 'All supplier products already added'
        : 'Select a product';

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
            onChange={(e) => onSupplierChange(e.target.value)}
            aria-label="Select Active supplier"
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
          <label>Product<span className="required">*</span></label>
          <select
            className="filter-select"
            value={productSelectValue}
            onChange={(e) => onProductSelect(e.target.value)}
            disabled={!form.supplierId || supplierProducts.length === 0}
            aria-label="Select product"
            style={{ marginBottom: 8, width: '100%', maxWidth: '100%' }}
          >
            <option value="">{productPlaceholder}</option>
            {availableOptions.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_name}{p.sku ? ` (${p.sku})` : ''}
              </option>
            ))}
          </select>
          {form.supplierId && supplierProducts.length === 0 ? (
            <p className="form-error" style={{ marginTop: 0 }}>
              No products available for this supplier.
            </p>
          ) : null}
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
            <EmptyState
              title="No products yet"
              description={
                form.supplierId
                  ? 'Choose a product from the dropdown to add it to this restock.'
                  : 'Select an Active supplier, then choose products from the dropdown.'
              }
            />
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
          onClick={() => openConfirm('draft')}
          disabled={submitting || !lines.length}
        >
          {submitting && confirmAction === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => openConfirm('submit')}
          disabled={submitting || !lines.length}
        >
          {submitting && confirmAction === 'submit' ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>

      {confirmAction ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restock-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirm();
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="restock-confirm-title">
                {confirmAction === 'draft' ? 'Save draft' : 'Submit for approval'}
              </h3>
              <button
                className="icon-action-button"
                type="button"
                title="Close"
                disabled={submitting}
                onClick={closeConfirm}
              >
                <NavIcon name="close" />
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>
              {confirmAction === 'draft'
                ? 'Are you sure you want to save this restock request as a draft?'
                : 'Are you sure you want to submit this restock request for Branch Manager approval? Please review your entries before proceeding.'}
            </p>
            <div className="panel" style={{ padding: '10px 12px', marginBottom: 4, boxShadow: 'none' }}>
              <div style={{ fontWeight: 650 }}>
                {totals.lineCount} line{totals.lineCount === 1 ? '' : 's'} · +{totals.totalUnits} total units
              </div>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                {confirmAction === 'submit'
                  ? 'Stock will not increase until Branch Manager approval.'
                  : 'You can submit this draft for approval later.'}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                disabled={submitting}
                onClick={closeConfirm}
              >
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={submitting}
                onClick={confirmSaveRestock}
              >
                {confirmAction === 'draft'
                  ? (submitting ? 'Saving…' : 'Save draft')
                  : (submitting ? 'Submitting…' : 'Confirm submission')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
