import { useEffect, useMemo, useState } from 'react';
import { fetchBranchInventory, submitStockCount } from '../../api/inventoryService.js';
import { getCurrentUser } from '../../api/authService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import { NavIcon } from '../../navIcons';
import { ProductSearchSelect } from './ProductSearchSelect.jsx';

function varianceOf(physical, systemQty) {
  if (physical === '' || physical == null) return null;
  const n = Number(physical);
  if (!Number.isFinite(n)) return null;
  return n - Number(systemQty || 0);
}

/**
 * Multi-product physical inventory count session.
 * Optional prefills: initialProductId from product detail shortcut.
 */
export function StockCountDocumentForm({
  navigate,
  showToast,
  initialProductId = '',
  cancelTo = '/warehouse/stock-counts',
}) {
  const user = getCurrentUser();
  const [branchStock, setBranchStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const invRes = await fetchBranchInventory();
      if (invRes.success) setBranchStock(invRes.data || []);
      else showToast?.(invRes.message || 'Failed to load branch stock.', 'error');
      setLoading(false);
    }
    load();
  }, [showToast]);

  useEffect(() => {
    if (!initialProductId || !branchStock.length) return;
    const row = branchStock.find((r) => String(r.product_id) === String(initialProductId));
    if (!row) return;
    setLines((prev) => {
      if (prev.some((line) => String(line.product_id) === String(initialProductId))) return prev;
      const systemQty = Number(row.available_stock ?? 0);
      return [{
        product_id: Number(row.product_id),
        product_name: row.product_name,
        sku: row.sku,
        system_quantity: systemQty,
        physical_quantity: String(systemQty),
      }];
    });
  }, [initialProductId, branchStock]);

  const availableOptions = useMemo(
    () => branchStock.filter((r) => !lines.some((line) => Number(line.product_id) === Number(r.product_id))),
    [branchStock, lines]
  );

  const addLine = (row) => {
    if (!row) return;
    if (lines.some((line) => Number(line.product_id) === Number(row.product_id))) {
      showToast?.('That product is already on this stock count.', 'error');
      return;
    }
    const systemQty = Number(row.available_stock ?? 0);
    setLines((prev) => [...prev, {
      product_id: Number(row.product_id),
      product_name: row.product_name,
      sku: row.sku,
      system_quantity: systemQty,
      physical_quantity: String(systemQty),
    }]);
  };

  const updatePhysical = (productId, physical_quantity) => {
    setLines((prev) => prev.map((line) => (
      Number(line.product_id) === Number(productId) ? { ...line, physical_quantity } : line
    )));
  };

  const removeLine = (productId) => {
    setLines((prev) => prev.filter((line) => Number(line.product_id) !== Number(productId)));
  };

  const lineSummaries = useMemo(() => lines.map((line) => {
    const variance = varianceOf(line.physical_quantity, line.system_quantity);
    return { ...line, variance };
  }), [lines]);

  const discrepancyLines = lineSummaries.filter((l) => l.variance != null && l.variance !== 0);
  const matchedCount = lineSummaries.filter((l) => l.variance === 0).length;

  const validate = () => {
    const nextErrors = {};
    if (!lines.length) nextErrors.lines = 'Add at least one product to count.';
    for (const line of lines) {
      const physical = Number(line.physical_quantity);
      if (line.physical_quantity === '' || !Number.isFinite(physical) || physical < 0) {
        nextErrors.lines = `Enter a valid physical count for ${line.product_name}.`;
        break;
      }
    }
    if (discrepancyLines.length && !notes.trim()) {
      nextErrors.notes = 'Notes are required when any product has a variance.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const openConfirm = () => {
    if (submitting) return;
    if (!validate()) {
      showToast('Please fix the errors.', 'error');
      return;
    }
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirmOpen(false);
  };

  const proceedToReview = () => {
    if (submitting) return;
    if (!validate()) {
      showToast('Please fix the errors.', 'error');
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    setReviewOpen(true);
  };

  const closeReview = () => {
    if (submitting) return;
    setReviewOpen(false);
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    if (!validate()) {
      showToast('Please fix the errors.', 'error');
      setReviewOpen(false);
      return;
    }

    setSubmitting(true);
    const result = await submitStockCount({
      notes: notes.trim(),
      lines: lines.map((line) => ({
        product_id: line.product_id,
        physical_count: Number(line.physical_quantity),
        expected_system_quantity: Number(line.system_quantity),
      })),
    });
    setSubmitting(false);

    if (!result.success) {
      showToast(result.message || 'Submit failed.', 'error');
      if (result.data?.live_system_quantity != null) {
        setReviewOpen(false);
        // Refresh system quantities so the employee can re-count against live stock.
        const invRes = await fetchBranchInventory();
        if (invRes.success) {
          const map = new Map((invRes.data || []).map((r) => [Number(r.product_id), Number(r.available_stock ?? 0)]));
          setBranchStock(invRes.data || []);
          setLines((prev) => prev.map((line) => ({
            ...line,
            system_quantity: map.has(Number(line.product_id))
              ? map.get(Number(line.product_id))
              : line.system_quantity,
          })));
        }
      }
      return;
    }

    setReviewOpen(false);
    showToast(result.message || 'Stock count saved.', 'success');
    const id = result.data?.count_id;
    if (id) navigate(`/warehouse/stock-counts/${id}`);
    else navigate('/warehouse/stock-counts');
  };

  if (loading) return <LoadingState message="Loading branch stock…" />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <h3 style={{ marginTop: 0 }}>New Stock Count</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          Zero-variance counts complete immediately. Any variance requires Branch Manager approval before stock changes.
        </p>

        <div className="form-group">
          <label>Products<span className="required">*</span></label>
          <div style={{ marginBottom: 10 }}>
            <ProductSearchSelect
              options={availableOptions}
              onSelect={addLine}
              placeholder="Search product or SKU…"
              emptyLabel="No matching products"
            />
          </div>
          {errors.lines ? <p className="form-error">{errors.lines}</p> : null}

          {lineSummaries.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>System qty</th>
                    <th>Physical count</th>
                    <th>Variance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineSummaries.map((line) => {
                    const v = line.variance;
                    const hasVar = v != null && v !== 0;
                    return (
                      <tr key={line.product_id}>
                        <td><strong>{line.product_name}</strong></td>
                        <td><span className="mono-cell">{line.sku || '—'}</span></td>
                        <td>{line.system_quantity}</td>
                        <td style={{ minWidth: 140 }}>
                          <QuantityStepper
                            value={line.physical_quantity}
                            min={0}
                            onChange={(next) => updatePhysical(line.product_id, next)}
                            aria-label={`Physical count for ${line.product_name}`}
                          />
                        </td>
                        <td style={{
                          fontWeight: 600,
                          color: hasVar ? (v > 0 ? '#2A9B6A' : '#dc2626') : undefined,
                        }}>
                          {v == null ? '—' : (v > 0 ? `+${v}` : v)}
                        </td>
                        <td>
                          <button
                            className="icon-action-button danger"
                            type="button"
                            title="Remove"
                            onClick={() => removeLine(line.product_id)}
                          >
                            <NavIcon name="close" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No products yet"
              description="Add products you are physically verifying in this count session."
            />
          )}
        </div>

        <div className="form-group">
          <label>
            Session notes
            {discrepancyLines.length ? <span className="required">*</span> : null}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={discrepancyLines.length
              ? 'Explain discrepancies before adjusting inventory…'
              : 'Optional notes for this count session'}
          />
          {errors.notes ? <p className="form-error">{errors.notes}</p> : null}
        </div>

        {lineSummaries.length ? (
          <p className="text-ink/70" style={{ margin: 0, fontSize: '0.88rem' }}>
            {lineSummaries.length} product{lineSummaries.length === 1 ? '' : 's'}
            {' · '}
            {discrepancyLines.length} with variance
            {' · '}
            {matchedCount} matched
          </p>
        ) : null}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(cancelTo)} disabled={submitting}>
          Cancel
        </button>
        <button
          className="button"
          type="button"
          onClick={openConfirm}
          disabled={submitting || !branchStock.length || !lines.length}
        >
          Review &amp; submit
        </button>
      </div>

      {confirmOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-count-confirm-title"
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
              <h3 id="stock-count-confirm-title">Review &amp; submit</h3>
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
              Are you sure you want to proceed with reviewing and requesting this stock count? Please verify the entered stock count details before continuing.
            </p>
            <div className="panel" style={{ padding: '10px 12px', marginBottom: 4, boxShadow: 'none' }}>
              <div style={{ fontWeight: 650 }}>
                {lineSummaries.length} product{lineSummaries.length === 1 ? '' : 's'}
                {' · '}
                {discrepancyLines.length} with variance
                {' · '}
                {matchedCount} matched
              </div>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                {discrepancyLines.length
                  ? 'Variances require Branch Manager approval before stock changes.'
                  : 'Matched counts complete without stock adjustments.'}
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
                onClick={proceedToReview}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-count-review-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReview();
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="stock-count-review-title">
                {discrepancyLines.length ? 'Review inventory discrepancies' : 'Confirm stock count'}
              </h3>
              <button
                className="icon-action-button"
                type="button"
                title="Close"
                disabled={submitting}
                onClick={closeReview}
              >
                <NavIcon name="close" />
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.88rem' }}>
              {discrepancyLines.length
                ? `Confirming will adjust recorded inventory for ${discrepancyLines.length} product${discrepancyLines.length === 1 ? '' : 's'}. Matched counts are recorded without changing stock.`
                : 'All counted products match system quantity. No inventory adjustments will be applied.'}
            </p>

            <div className="corvex-table-wrapper" style={{ maxHeight: 280, overflow: 'auto' }}>
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>System</th>
                    <th>Physical</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {(discrepancyLines.length ? discrepancyLines : lineSummaries).map((line) => (
                    <tr key={line.product_id}>
                      <td>
                        <strong>{line.product_name}</strong>
                        <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                          {line.sku || '—'}
                        </span>
                      </td>
                      <td>{line.system_quantity}</td>
                      <td>{line.physical_quantity}</td>
                      <td style={{
                        fontWeight: 600,
                        color: line.variance
                          ? (line.variance > 0 ? '#2A9B6A' : '#dc2626')
                          : undefined,
                      }}>
                        {line.variance > 0 ? `+${line.variance}` : line.variance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
              Total counted: {lineSummaries.length}
              {' · '}With variance: {discrepancyLines.length}
              {' · '}Matched: {matchedCount}
            </p>

            <div className="modal-actions">
              <button className="button secondary" type="button" disabled={submitting} onClick={closeReview}>
                Cancel
              </button>
              <button className="button" type="button" disabled={submitting} onClick={handleConfirmSubmit}>
                {submitting
                  ? 'Saving…'
                  : (discrepancyLines.length ? 'Confirm adjustments' : 'Confirm count')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
