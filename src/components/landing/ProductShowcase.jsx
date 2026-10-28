import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.reduceMotion === '1';
}

export function ProductShowcase() {
  const { productsIntro, products } = landingContent;
  const [activeId, setActiveId] = useState(products[0].id);
  const reduced = useReducedMotion();
  const active = products.find((product) => product.id === activeId) ?? products[0];
  const activeIndex = Math.max(0, products.findIndex((product) => product.id === active.id));
  const allowMotion = reduced === false && document.documentElement.dataset.reduceMotion !== '1';

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (products.some((product) => product.id === id)) setActiveId(id);
  }, [products]);

  const selectProduct = (id, { scrollToStage = false } = {}) => {
    setActiveId(id);
    const nextHash = `#${id}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
    const narrow = window.matchMedia('(max-width: 959px)').matches;
    if (scrollToStage && narrow) {
      document.getElementById('collection-stage')?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  return (
    <section className="cvx-products" id="products" aria-labelledby="products-title">
      <div className="cvx-wrap">
        <Reveal as="div" className="cvx-section-head">
          <div>
            <Kicker>{productsIntro.kicker}</Kicker>
            <h2 id="products-title">{productsIntro.title}</h2>
          </div>
          <p className="cvx-section-lead">{productsIntro.lede}</p>
        </Reveal>

        <div className="cvx-products-layout">
          <figure
            id="collection-stage"
            className="cvx-stage"
            aria-labelledby="collection-stage-title"
          >
            <div
              className={`cvx-stage-media ${active.fit === 'cover' ? 'is-cover' : 'is-contain'}`}
              style={{ background: active.stage }}
            >
              <AnimatePresence initial={false}>
                <motion.img
                  key={active.id}
                  src={active.image}
                  alt=""
                  initial={allowMotion ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={allowMotion ? { opacity: 0 } : undefined}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
              </AnimatePresence>
            </div>
            <figcaption aria-live="polite">
              <p className="cvx-stage-count">
                <span>{String(activeIndex + 1).padStart(2, '0')}</span>
                <span aria-hidden="true"> / {String(products.length).padStart(2, '0')}</span>
              </p>
              <p className="cvx-stage-category">{active.category}</p>
              <h3 id="collection-stage-title">{active.name}</h3>
              <p>{active.note}</p>
            </figcaption>
          </figure>

          <ul className="cvx-catalog">
            {products.map((product) => {
              const selected = product.id === active.id;
              return (
                <li key={product.id} id={product.id} className={selected ? 'cvx-catalog-item is-active' : 'cvx-catalog-item'}>
                  <div className="cvx-catalog-row">
                    <button
                      type="button"
                      className="cvx-thumb"
                      onClick={() => selectProduct(product.id)}
                      aria-label={`Show ${product.name}`}
                    >
                      <img src={product.image} alt="" />
                    </button>
                    <div className="cvx-catalog-copy">
                      <p className="cvx-catalog-category">{product.category}</p>
                      <p className="cvx-catalog-name">{product.name}</p>
                      <p className="cvx-catalog-summary">{product.summary}</p>
                    </div>
                    <a
                      className="cvx-learn"
                      href={`#${product.id}`}
                      aria-current={selected ? 'true' : undefined}
                      aria-controls="collection-stage"
                      onClick={(event) => {
                        event.preventDefault();
                        selectProduct(product.id, { scrollToStage: true });
                      }}
                    >
                      Learn More
                      <ArrowIcon />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
