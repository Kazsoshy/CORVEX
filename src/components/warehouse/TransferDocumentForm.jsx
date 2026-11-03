import { useEffect, useMemo, useState } from 'react';
import {
  createInventoryTransfer,
  fetchBranchInventory,
  fetchInventoryBranches,
} from '../../api/inventoryService.js';
import { getCurrentUser } from '../../api/authService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import { NavIcon } from '../../navIcons';
import { ProductSearchSelect } from './ProductSearchSelect.jsx';

/**
 * Multi-product transfer request form.
 * Optional prefills: initialProductId from product detail shortcut.
 */
export function TransferDocumentForm({
  navigate,
  showToast,
  initialProductId = '',
  cancelTo = '/warehouse/transfers?tab=requests',
}) {
  const user = getCurrentUser();
  const sourceBranchId = user?.branch?.id;
  const [branchStock, setBranchStock] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [invRes, branchRes] = await Promise.all([
        fetchBranchInventory(),
        fetchInventoryBranches(),
      ]);
      if (invRes.success) setBranchStock(invRes.data || []);
      if (branchRes.success) setBranches(branchRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const availOf = (row) => Number(
    row.available_to_transfer ?? Math.max(0, Number(row.available_stock ?? 0) - Number(row.pending_outbound ?? 0))
  );

  useEffect(() => {
    if (!initialProductId || !branchStock.length) return;
    const row = branchStock.find((r) => String(r.product_id) === String(initialProductId));
    if (!row || availOf(row) <= 0) return;
    setLines((prev) => {
      if (prev.some((line) => String(line.product_id) === String(initialProductId))) return prev;
      return [{
        product_id: Number(row.product_id),
        product_name: row.product_name,
        sku: row.sku,
        on_hand: Number(row.available_stock ?? 0),
        available: availOf(row),
        quantity: '1',
      }];
    });
  }, [initialProductId, branchStock]);

  const stockOptions = useMemo(
    () => branchStock.filter((r) => availOf(r) > 0),
    [branchStock]
  );

  const availableOptions = useMemo(
    () => stockOptions.filter((r) => !lines.some((line) => Number(line.product_id) === Number(r.product_id))),
    [stockOptions, lines]
  );

  const addProduct = (row) => {
    if (!row) return;
    if (lines.some((line) => Number(line.product_id) === Number(row.product_id))) {
      showToast('That product is already on this transfer.', 'error');
      return;
    }
    setLines((prev) => [...prev, {
      product_id: Number(row.product_id),
      product_name: row.product_name,
      sku: row.sku,
      on_hand: Number(row.available_stock ?? 0),
      available: availOf(row),
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
    if (!destination) nextErrors.destination = 'Select destination branch.';
    if (!lines.length) nextErrors.lines = 'Add at least one product.';
    const normalized = [];
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) {
        nextErrors.lines = `Enter a positive quantity for ${line.product_name}.`;
        break;
      }
      const maxAvail = Number(line.available ?? line.on_hand);
      if (qty > maxAvail) {
        nextErrors.lines = `${line.product_name}: available to transfer is ${maxAvail} (on hand ${line.on_hand}).`;
        break;
      }
      normalized.push({ product_id: line.product_id, quantity: qty });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors.', 'error');
      return;
    }

    setSubmitting(true);
    const result = await createInventoryTransfer({
      destination_branch_id: Number(destination),
      notes: notes.trim(),
      lines: normalized,
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Request failed.', 'error');
      return;
    }
    showToast(result.message || 'Submitted for manager approval.', 'success');
    const id = result.data?.transfer_id;
    if (id) navigate(`/warehouse/transfers/${id}?from=requests`);
    else navigate('/warehouse/transfers?tab=requests');
  };

  if (loading) return <LoadingState message="Loading branch stock…" />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <h3 style={{ marginTop: 0 }}>New Transfer</h3>

        <div className="form-group">
          <label>Destination branch<span className="required">*</span></label>
          <select className="filter-select" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Select destination</option>
            {branches.filter((b) => Number(b.branch_id) !== Number(sourceBranchId)).map((b) => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
            ))}
          </select>
          {errors.destination ? <p className="form-error">{errors.destination}</p> : null}
        </div>

        <div className="form-group">
          <label>Products<span className="required">*</span></label>
          <div style={{ marginBottom: 10 }}>
            <ProductSearchSelect
              options={availableOptions}
              onSelect={addProduct}
              placeholder="Search product or SKU…"
              emptyLabel="No matching products"
              disabled={!stockOptions.length}
            />
          </div>
          {errors.lines ? <p className="form-error">{errors.lines}</p> : null}

          {lines.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>On hand</th>
                    <th>Available</th>
                    <th>Qty to send</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.product_id}>
                      <td><strong>{line.product_name}</strong></td>
                      <td><span className="mono-cell">{line.sku || '—'}</span></td>
                      <td>{line.on_hand}</td>
                      <td>{line.available ?? line.on_hand}</td>
                      <td style={{ minWidth: 140 }}>
                        <QuantityStepper
                          value={line.quantity}
                          min={1}
                          max={(line.available ?? line.on_hand) || undefined}
                          onChange={(next) => updateQty(line.product_id, next)}
                          aria-label={`Quantity for ${line.product_name}`}
                        />
                      </td>
                      <td>
                        <button className="icon-action-button danger" type="button" title="Remove" onClick={() => removeLine(line.product_id)}>
                          <NavIcon name="close" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No products yet" description="Search and select a product to add." />
          )}
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for transfer (recommended for Branch Head / OM review)"
          />
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(cancelTo)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting || !stockOptions.length}>
          {submitting ? 'Submitting…' : 'Submit transfer request'}
        </button>
      </div>
      {!stockOptions.length ? (
        <p className="form-error">No products with stock at your branch. Restock first.</p>
      ) : null}
    </div>
  );
}
