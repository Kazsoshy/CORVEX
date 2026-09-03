import { Link } from 'react-router-dom';

export function Breadcrumbs({ items }) {
  if (!items?.length) return null;

  return (
    <nav className="breadcrumb breadcrumb-nav" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.to}-${index}`} className="breadcrumb-item">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {isLast ? (
              <span className="breadcrumb-current" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link to={item.to}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
