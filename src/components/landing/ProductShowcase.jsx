import { useState, useEffect, useRef } from 'react';
import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

const TRANSITION_MS = 800;

export function ProductShowcase() {
  const { productsIntro, products } = landingContent;
  const count = products.length;

  // Triple array for infinite looping: [set0, set1, set2]
  const items = [...products, ...products, ...products];
  const [virtualIndex, setVirtualIndex] = useState(count); // starts in middle set (index = count)
  const [isTransitioning, setIsTransitioning] = useState(true);
  const trackRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const snapTimeoutRef = useRef(null);
  const touchStartX = useRef(null);

  // Sync hash if present
  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    const foundIdx = products.findIndex((p) => p.id === hashId);
    if (foundIdx !== -1) {
      setVirtualIndex(count + foundIdx);
    }
  }, [products, count]);

  const resetBoundary = (targetIdx) => {
    setIsTransitioning(false);
    setVirtualIndex(targetIdx);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsTransitioning(true);
        isAnimatingRef.current = false;
      });
    });
  };

  const slideRight = () => {
    // Right button: smoothly slide toward the right
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsTransitioning(true);
    setVirtualIndex((prev) => prev - 1);
  };

  const slideLeft = () => {
    // Left button: smoothly slide toward the left
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsTransitioning(true);
    setVirtualIndex((prev) => prev + 1);
  };

  const goToProduct = (targetProductIdx) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsTransitioning(true);
    setVirtualIndex(count + targetProductIdx);
  };

  useEffect(() => {
    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
    }

    snapTimeoutRef.current = setTimeout(() => {
      isAnimatingRef.current = false;
      if (virtualIndex >= 2 * count) {
        resetBoundary(virtualIndex - count);
      } else if (virtualIndex < count) {
        resetBoundary(virtualIndex + count);
      }
    }, TRANSITION_MS + 20);

    return () => {
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    };
  }, [virtualIndex, count]);

  const handleTransitionEnd = (e) => {
    if (e.target !== trackRef.current || e.propertyName !== 'transform') return;
    isAnimatingRef.current = false;
    if (virtualIndex >= 2 * count) {
      resetBoundary(virtualIndex - count);
    } else if (virtualIndex < count) {
      resetBoundary(virtualIndex + count);
    }
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (deltaX > 40) {
      slideRight();
    } else if (deltaX < -40) {
      slideLeft();
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
          onClick={slideLeft}
          aria-label="Slide toward the left"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          className="cvx-products-arrow cvx-products-arrow-next"
          onClick={slideRight}
          aria-label="Slide toward the right"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="cvx-products-track-wrap">
          <div
            ref={trackRef}
            className="cvx-products-track"
            style={{
              '--active-idx': virtualIndex,
              transition: isTransitioning
                ? `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`
                : 'none',
            }}
            onTransitionEnd={handleTransitionEnd}
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
                  onClick={() => {
                    if (dist !== 0) {
                      if (isAnimatingRef.current) return;
                      isAnimatingRef.current = true;
                      setIsTransitioning(true);
                      setVirtualIndex(idx);
                    }
                  }}
                  role="button"
                  tabIndex={dist <= 1 ? 0 : -1}
                  aria-label={`${product.name} — ${product.category}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setVirtualIndex(idx);
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
                    {dist === 0 && (
                      <p className="cvx-product-summary">{product.summary}</p>
                    )}
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