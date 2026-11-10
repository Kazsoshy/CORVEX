const PRODUCT_IMAGE_MODULES = import.meta.glob(
  '../assets/products-image/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' }
);

const PRODUCT_IMAGES_BY_SLUG = Object.entries(PRODUCT_IMAGE_MODULES).reduce((acc, [filePath, url]) => {
  const file = filePath.split('/').pop() || '';
  const slug = file.replace(/\.[^.]+$/, '').toLowerCase();
  if (slug && url) acc[slug] = url;
  return acc;
}, {});

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function catalogImage(name) {
  const slug = slugify(name);
  if (!slug) return '';
  if (PRODUCT_IMAGES_BY_SLUG[slug]) return PRODUCT_IMAGES_BY_SLUG[slug];
  const matchKey = Object.keys(PRODUCT_IMAGES_BY_SLUG).find((key) => slug.includes(key) || key.includes(slug));
  return matchKey ? PRODUCT_IMAGES_BY_SLUG[matchKey] : '';
}

/** Real catalog photo for a purchased product. Letter placeholders are skipped. */
export function resolveProductImage(product) {
  const url = String(product?.image_url || '').trim();
  if (url && !/placehold\.co/i.test(url)) return url;
  return catalogImage(product?.product_name || product?.name || '');
}
