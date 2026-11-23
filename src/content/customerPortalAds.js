/**
 * Customer Portal product advertisements / featured showcase.
 * Images come exclusively from src/assets/product-images via landingContent.
 * Promo prices and badges are UI demonstration samples when live pricing is unavailable.
 */
import { landingContent } from './landingContent.js';

const byId = Object.fromEntries((landingContent.products || []).map((p) => [p.id, p]));

/** Demo promotional overlays only — not live POS pricing. */
const PROMO_SAMPLES = {
  'zooey-rattan-sala-set': {
    label: 'SPECIAL OFFER',
    originalPrice: 18990,
    promoPrice: 15990,
  },
  'uratex-classic-mattress': {
    label: 'SALE',
    originalPrice: 8990,
    promoPrice: 7490,
  },
  'square-table': {
    label: 'NEW ARRIVAL',
    originalPrice: null,
    promoPrice: 2490,
  },
  'zooey-dish-cabinet': {
    label: 'SALE',
    originalPrice: 6990,
    promoPrice: 5490,
  },
  'uratex-kate-chair': {
    label: 'SPECIAL OFFER',
    originalPrice: 1290,
    promoPrice: 990,
  },
  'bound-pocket-mattress': {
    label: 'SALE',
    originalPrice: 12990,
    promoPrice: 10990,
  },
  'folding-mattress': {
    label: 'NEW ARRIVAL',
    originalPrice: null,
    promoPrice: 3990,
  },
  'monoblock-chair': {
    label: 'SPECIAL OFFER',
    originalPrice: 450,
    promoPrice: 350,
  },
  'uratex-zoe-plastic-ware': {
    label: 'SALE',
    originalPrice: 1890,
    promoPrice: 1490,
  },
  'ceramic-ginger-jar': {
    label: 'NEW ARRIVAL',
    originalPrice: null,
    promoPrice: 890,
  },
};

function withPromo(productId) {
  const product = byId[productId];
  if (!product) return null;
  const promo = PROMO_SAMPLES[productId] || {};
  const originalPrice = promo.originalPrice ?? null;
  const promoPrice = promo.promoPrice ?? null;
  let discountPct = null;
  if (originalPrice != null && promoPrice != null && originalPrice > promoPrice) {
    discountPct = Math.round(((originalPrice - promoPrice) / originalPrice) * 100);
  }
  return {
    ...product,
    label: promo.label || 'FEATURED',
    originalPrice,
    promoPrice,
    discountPct,
    demoPricing: true,
  };
}

/** Compact sponsored ads for the right sidebar (Facebook-style). */
export const customerSponsoredAds = [
  'uratex-classic-mattress',
  'zooey-rattan-sala-set',
  'zooey-dish-cabinet',
  'monoblock-chair',
].map(withPromo).filter(Boolean);

/** Featured carousel products (horizontal browse). */
export const customerFeaturedProducts = [
  'bound-pocket-mattress',
  'uratex-kate-chair',
  'folding-mattress',
  'square-table',
  'uratex-zoe-plastic-ware',
  'ceramic-ginger-jar',
].map(withPromo).filter(Boolean);

export const CUSTOMER_ADS_DISCLAIMER =
  'Promotional prices shown for demonstration. Ask your branch for current offers.';
