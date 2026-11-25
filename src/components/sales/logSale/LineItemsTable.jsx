import { formatCurrency } from '../../../utils/formatters.js';
import { QuantityStepper } from '../../shared/QuantityStepper.jsx';
import { NavIcon } from '../../../navIcons';
import { ProductThumb } from './ProductThumb';

export function LineItemsTable({
  lineItems,
  products,
  error,
  onAddClick,
  onQuantityChange,
  onRequestRemove,
  invoiceTotal,
}) {
  const hasLines = lineItems.some((l) => l.productId);

  return (
    <section className="panel content-panel log-sale-step" aria-labelledby="log-sale-step-items">
      <div className="log-sale-step-header">
        <span className="log-sale-step-num" aria-hidden="true">2</span>
        <div style={{ flex: 1 }}>
          <h3 id="log-sale-step-items">Products</h3>
          <p className="muted" style={{ margin: 0 }}>Add line items before choosing payment.</p>
        </div>
        <button className="button secondary" type="button" onClick={onAddClick}>
          Add Product
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="log-sale-lines-desktop">
        <table className="corvex-table log-sale-lines-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Stock</th>
              <th>Unit price</th>
              <th>Qty</th>
              <th>Line total</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {!hasLines ? (
              <tr>
                <td colSpan={6} className="muted">No products yet — use Add Product.</td>
              </tr>
            ) : null}
            {lineItems.map((line, index) => {
              const product = products.find((p) => String(p.product_id) === String(line.productId));
              if (!product) return null;
              const unitPrice = Number(product.unit_price) || 0;
              const quantity = Number(line.quantity) || 0;
              const stock = Number(product.available_stock ?? product.quantity ?? 0);
              const overStock = quantity > stock;
              return (
                <tr key={`${product.product_id}-${index}`}>
                  <td>
                    <div className="log-sale-line-product">
                      <ProductThumb
                        src={product.image_url || product.image || ''}
                        alt={product.product_name || ''}
                        size={40}
                      />
                      <div className="log-sale-line-product__text">
                        <strong>{product.product_name}</strong>
                        {overStock ? (
                          <div className="form-error" style={{ margin: 0, fontSize: '0.75rem' }}>
                            Exceeds available stock ({stock})
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>{stock}</td>
                  <td>{formatCurrency(unitPrice)}</td>
                  <td>
                    <QuantityStepper
                      value={line.quantity}
                      min={1}
                      max={Math.max(stock, 1)}
                      onChange={(next) => onQuantityChange(index, next, stock)}
                      aria-label={`Quantity for ${product.product_name}`}
                    />
                  </td>
                  <td>{formatCurrency(unitPrice * quantity)}</td>
                  <td className="log-sale-line-remove">
                    <button
                      className="button ghost log-sale-remove-btn"
                      type="button"
                      title="Remove product"
                      aria-label={`Remove ${product.product_name}`}
                      onClick={() => onRequestRemove(index)}
                    >
                      <NavIcon name="close" />
                      <span>Remove</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="log-sale-lines-mobile">
        {!hasLines ? (
          <div className="log-sale-line-card muted">No products yet — use Add Product.</div>
        ) : null}
        {lineItems.map((line, index) => {
          const product = products.find((p) => String(p.product_id) === String(line.productId));
          if (!product) return null;
          const unitPrice = Number(product.unit_price) || 0;
          const quantity = Number(line.quantity) || 0;
          const stock = Number(product.available_stock ?? product.quantity ?? 0);
          return (
            <div key={`m-${product.product_id}-${index}`} className="log-sale-line-card">
              <div className="flex justify-between gap-2 items-start">
                <div className="log-sale-line-product">
                  <ProductThumb
                    src={product.image_url || product.image || ''}
                    alt={product.product_name || ''}
                    size={44}
                  />
                  <div className="log-sale-line-product__text">
                    <strong>{product.product_name}</strong>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      Stock {stock} · {formatCurrency(unitPrice)} each
                    </div>
                  </div>
                </div>
                <button
                  className="button ghost log-sale-remove-btn"
                  type="button"
                  aria-label={`Remove ${product.product_name}`}
                  onClick={() => onRequestRemove(index)}
                >
                  <NavIcon name="close" />
                  <span>Remove</span>
                </button>
              </div>
              <div className="flex justify-between gap-2 items-center" style={{ marginTop: 8 }}>
                <QuantityStepper
                  value={line.quantity}
                  min={1}
                  max={Math.max(stock, 1)}
                  onChange={(next) => onQuantityChange(index, next, stock)}
                  aria-label={`Quantity for ${product.product_name}`}
                />
                <strong>{formatCurrency(unitPrice * quantity)}</strong>
              </div>
              {quantity > stock ? (
                <p className="form-error" style={{ marginBottom: 0 }}>Exceeds available stock ({stock})</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="log-sale-invoice-total">
        <span className="muted">Invoice total (before discounts)</span>
        <strong>{formatCurrency(invoiceTotal)}</strong>
      </p>
    </section>
  );
}
