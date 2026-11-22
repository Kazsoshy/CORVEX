import { useState, useEffect, useRef } from 'react';
import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

const TRANSITION_MS = 650;
const SETS = 5;
const START_SET = 2; // middle set
const THROTTLE_MS = 220;

export function ProductShowcase() {
  const { productsIntro, products } = landingContent;
  const count = products.length;

  // 5 repeated sets for a wide seamless buffer
  const items = Array.from({ length: SETS }).flatMap(() => products);
  const [virtualIndex, setVirtualIndex] = useState(START_SET * count);
  const [isInstant, setIsInstant] = useState(false);

  const settleTimeoutRef = useRef(null);
  const lastClickRef = useRef(0);
  const touchStartX = useRef(null);

  // Sync hash if present on initial load
  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    const foundIdx = products.findIndex((p) => p.id === hashId);
    if (foundIdx !== -1) {
      setVirtualIndex(START_SET * count + foundIdx);
    }
  }, [products, count]);

  // Navigate to Next product (slides track to the left, revealing next product from right)
  const handleNext = () => {
    if (isInstant) return;
    const now = Date.now();
    if (now - lastClickRef.current < THROTTLE_MS) return;
    lastClickRef.current = now;
    setVirtualIndex((prev) => prev + 1);
  };

  // Navigate to Previous product (slides track to the right, revealing previous product from left)
  const handlePrev = () => {
    if (isInstant) return;
    const now = Date.now();
    if (now - lastClickRef.current < THROTTLE_MS) return;
    lastClickRef.current = now;
    setVirtualIndex((prev) => prev - 1);
  };

  // Dot navigation taking the shortest path
  const goToProduct = (targetProductIdx) => {
    if (isInstant) return;
    const now = Date.now();
    if (now - lastClickRef.current < THROTTLE_MS) return;
    lastClickRef.current = now;

    const currentReal = ((virtualIndex % count) + count) % count;
    const forwardDiff = (targetProductIdx - currentReal + count) % count;

    if (forwardDiff === 0) return;

    if (forwardDiff <= count / 2) {
      setVirtualIndex((prev) => prev + forwardDiff);
    } else {
      setVirtualIndex((prev) => prev - (count - forwardDiff));
    }
  };

  const handleCardClick = (idx, dist) => {
    if (dist === 0 || isInstant) return;
    const now = Date.now();
    if (now - lastClickRef.current < THROTTLE_MS) return;
    lastClickRef.current = now;
    setVirtualIndex(idx);
  };

  // Seamless normalization when the carousel has settled at rest
  useEffect(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
    }

    settleTimeoutRef.current = setTimeout(() => {
      // Normalize only if drifted away from the center set (e.g. < count * 1.5 or >= count * 3.5)
      if (virtualIndex < count * 1.5 || virtualIndex >= count * 3.5) {
        const realIdx = ((virtualIndex % count) + count) % count;
        const targetIdx = START_SET * count + realIdx;
        if (targetIdx !== virtualIndex) {
          setIsInstant(true);
          setVirtualIndex(targetIdx);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setIsInstant(false);
            });
          });
        }
      }
    }, TRANSITION_MS + 60);

    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, [virtualIndex, count]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (deltaX > 40) {
      handlePrev();
    } else if (deltaX < -40) {
      handleNext();
    }
  };

  const realIndex = ((virtualIndex % count) + count) % count;

  return (
    <section className="cvx-products" id="products" aria-labelledby="products-title">
      <div className="cvx-wrap">
        <Reveal as="div" className="cvx-section-head cvx-products-head">
          <div>
            <Kicker>{productsIntro.kicker}</Kicker>
            <h2 id="products-title" className="cvx-products-title">
              <span>A selection from</span>
              <span className="cvx-products-title-accent">the collection.</span>
            </h2>
          </div>
          <p className="cvx-section-lead">{productsIntro.lede}</p>
        </Reveal>
      </div>

      {/* Full-width carousel stage inspired by the reference layout */}
      <div
        className="cvx-products-carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className="cvx-products-arrow cvx-products-arrow-prev"
          onClick={handlePrev}
          aria-label="Previous product"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          className="cvx-products-arrow cvx-products-arrow-next"
          onClick={handleNext}
          aria-label="Next product"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="cvx-products-track-wrap">
          <div
            className={`cvx-products-track ${isInstant ? 'is-instant' : ''}`}
            style={{
              '--active-idx': virtualIndex,
            }}
          >
            {items.map((product, idx) => {
              const dist = Math.abs(idx - virtualIndex);
              let stateClass = 'is-distant';
              if (dist === 0) stateClass = 'is-active';
              else if (dist === 1) stateClass = 'is-adjacent';
              else if (dist === 2) stateClass = 'is-peek';

              return (
                <article
                  key={`${product.id}-${idx}`}
                  className={`cvx-product-card ${stateClass}`}
                  onClick={() => handleCardClick(idx, dist)}
                  role="button"
                  tabIndex={dist <= 1 ? 0 : -1}
                  aria-label={`${product.name} — ${product.category}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCardClick(idx, dist);
                    }
                  }}
                >
                  <div className="cvx-product-card-media">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="cvx-product-card-img"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  <div className="cvx-product-card-info">
                    <span className="cvx-product-category">{product.category}</span>
                    <h3 className="cvx-product-name">{product.name}</h3>
                    <p className="cvx-product-summary">{product.summary}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dots indicator & Centered Explore More action matching the reference */}
      <div className="cvx-wrap">
        <div className="cvx-products-action">
          <div className="cvx-products-dots" role="tablist" aria-label="Product slides">
            {products.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={idx === realIndex}
                aria-label={`Go to ${p.name}`}
                className={`cvx-products-dot ${idx === realIndex ? 'is-active' : ''}`}
                onClick={() => goToProduct(idx)}
              />
            ))}
          </div>

          <a className="cvx-products-explore-btn" href="#contact">
            Explore Collection
          </a>
        </div>
      </div>
    </section>
  );
}
