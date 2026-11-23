import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '../../utils/formatters.js';
import {
  CUSTOMER_ADS_DISCLAIMER,
  customerFeaturedProducts,
  customerSponsoredAds,
} from '../../content/customerPortalAds.js';

function ProductDetailOverlay({ product, onClose }) {
  if (!product) return null;
  return createPortal(
    <div
      className="customer-ad-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-ad-detail-title"
      onClick={onClose}
    >
      <div className="customer-ad-overlay__card" onClick={(e) => e.stopPropagation()}>
        <header className="customer-ad-overlay__header">
          <div className="customer-ad-overlay__header-text">
            <p className="customer-section-eyebrow">Product details</p>
            <h3 id="customer-ad-detail-title">{product.name}</h3>
          </div>
          <button type="button" className="button ghost customer-ad-overlay__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="customer-ad-overlay__layout">
          <div className="customer-ad-overlay__media" style={{ background: product.stage || '#f8fafc' }}>
            <img src={product.image} alt={product.name} style={{ objectFit: product.fit || 'contain' }} />
          </div>

          <div className="customer-ad-overlay__body">
            <div className="customer-ad-overlay__meta">
              {product.label ? <span className="customer-ad-badge">{product.label}</span> : null}
              {product.category ? <span className="customer-ad-overlay__category">{product.category}</span> : null}
            </div>

            <p className="customer-ad-overlay__summary">{product.summary}</p>
            {product.note ? <p className="customer-ad-overlay__note">{product.note}</p> : null}

            <div className="customer-ad-overlay__pricing">
              <div className="customer-ad-price-row">
                {product.promoPrice != null ? (
                  <strong className="customer-ad-price customer-ad-price--lg">{formatCurrency(product.promoPrice)}</strong>
                ) : null}
                {product.originalPrice != null ? (
                  <span className="customer-ad-price-was">{formatCurrency(product.originalPrice)}</span>
                ) : null}
                {product.discountPct != null ? (
                  <span className="customer-ad-discount">-{product.discountPct}%</span>
                ) : null}
              </div>
              {product.demoPricing ? (
                <p className="customer-ad-disclaimer">{CUSTOMER_ADS_DISCLAIMER}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="customer-ad-overlay__actions">
          <button type="button" className="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SponsoredAdCard({ product, onView }) {
  return (
    <article className="customer-sponsored-card">
      <div className="customer-sponsored-card__media" style={{ background: product.stage || '#f8fafc' }}>
        <img src={product.image} alt="" style={{ objectFit: product.fit || 'contain' }} />
        {product.label ? <span className="customer-ad-badge customer-ad-badge--on-media">{product.label}</span> : null}
      </div>
      <div className="customer-sponsored-card__body">
        <h4>{product.name}</h4>
        <p>{product.summary}</p>
        <div className="customer-ad-price-row">
          {product.promoPrice != null ? (
            <strong className="customer-ad-price">{formatCurrency(product.promoPrice)}</strong>
          ) : null}
          {product.originalPrice != null ? (
            <span className="customer-ad-price-was">{formatCurrency(product.originalPrice)}</span>
          ) : null}
          {product.discountPct != null ? (
            <span className="customer-ad-discount">-{product.discountPct}%</span>
          ) : null}
        </div>
        <button type="button" className="button ghost customer-ad-view-btn" onClick={() => onView(product)}>
          View Product
        </button>
      </div>
    </article>
  );
}

function FeaturedCarousel({ products, onView }) {
  const count = products.length;
  const [index, setIndex] = useState(0);

  const goPrev = useCallback(() => {
    setIndex((i) => (count ? (i - 1 + count) % count : 0));
  }, [count]);

  const goNext = useCallback(() => {
    setIndex((i) => (count ? (i + 1) % count : 0));
  }, [count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (!count) return null;
  const product = products[index];

  return (
    <div className="customer-featured-carousel" aria-roledescription="carousel" aria-label="Featured products">
      <div className="customer-featured-carousel__toolbar">
        <h4>Featured</h4>
        <div className="customer-featured-carousel__nav">
          <button type="button" className="customer-carousel-arrow" onClick={goPrev} aria-label="Previous product">
            ‹
          </button>
          <span className="customer-featured-carousel__count" aria-live="polite">
            {index + 1}/{count}
          </span>
          <button type="button" className="customer-carousel-arrow" onClick={goNext} aria-label="Next product">
            ›
          </button>
        </div>
      </div>

      <div className="customer-featured-carousel__stage" key={product.id}>
        <div className="customer-featured-carousel__media" style={{ background: product.stage || '#f8fafc' }}>
          <img src={product.image} alt={product.name} style={{ objectFit: product.fit || 'contain' }} />
          {product.label ? <span className="customer-ad-badge customer-ad-badge--on-media">{product.label}</span> : null}
        </div>
        <div className="customer-featured-carousel__body">
          <strong>{product.name}</strong>
          <p>{product.summary}</p>
          <div className="customer-ad-price-row">
            {product.promoPrice != null ? (
              <strong className="customer-ad-price">{formatCurrency(product.promoPrice)}</strong>
            ) : null}
            {product.originalPrice != null ? (
              <span className="customer-ad-price-was">{formatCurrency(product.originalPrice)}</span>
            ) : null}
            {product.discountPct != null ? (
              <span className="customer-ad-discount">-{product.discountPct}%</span>
            ) : null}
          </div>
          <button type="button" className="button secondary customer-ad-view-btn" onClick={() => onView(product)}>
            View Product
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Right-side product advertisements + featured carousel for the customer home dashboard.
 */
export function CustomerProductAdsPanel() {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <aside className="customer-ads-panel" aria-label="Product advertisements">
      <div className="customer-ads-panel__header">
        <p className="customer-section-eyebrow">Sponsored</p>
        <h3>Product offers</h3>
        <p className="muted customer-ads-panel__lede">Featured pieces from the CORVEX collection.</p>
      </div>

      <FeaturedCarousel products={customerFeaturedProducts} onView={setSelected} />

      <div className="customer-sponsored-list">
        <p className="customer-sponsored-list__label">More promotions</p>
        {customerSponsoredAds.map((product) => (
          <SponsoredAdCard key={product.id} product={product} onView={setSelected} />
        ))}
      </div>

      <p className="customer-ad-disclaimer customer-ad-disclaimer--footer">{CUSTOMER_ADS_DISCLAIMER}</p>

      <ProductDetailOverlay product={selected} onClose={() => setSelected(null)} />
    </aside>
  );
}
