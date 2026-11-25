export function ProductThumb({ src, alt = '', size = 44 }) {
  const style = { width: size, height: size };
  if (src) {
    return (
      <img
        className="product-thumb log-sale-product-thumb"
        src={src}
        alt={alt}
        width={size}
        height={size}
        style={style}
      />
    );
  }
  return (
    <span
      className="product-thumb product-thumb--empty log-sale-product-thumb"
      style={style}
      aria-hidden="true"
    >
      N/A
    </span>
  );
}
