import { formatCurrency } from '../../../utils/formatters.js';

export function SpotCashSummary({ pricing }) {
  if (!pricing) {
    return <p className="muted">Add products to see the spot cash price.</p>;
  }

  return (
    <div className="log-sale-price-card">
      <h4 className="subsection-title" style={{ marginTop: 0 }}>Price breakdown</h4>
      <div className="log-sale-price-row">
        <span className="muted">Original total</span>
        <strong>{formatCurrency(pricing.originalTotal)}</strong>
      </div>
      <div className="log-sale-price-row log-sale-price-row--benefit">
        <span className="muted">Spot cash discount (30%)</span>
        <strong>−{formatCurrency(pricing.discountAmount)}</strong>
      </div>
      <div className="log-sale-price-row log-sale-price-row--final">
        <span>Final cash price</span>
        <strong>{formatCurrency(pricing.finalObligation)}</strong>
      </div>
    </div>
  );
}
