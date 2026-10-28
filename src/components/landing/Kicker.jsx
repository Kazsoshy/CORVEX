export function Kicker({ children }) {
  return (
    <p className="cvx-kicker">
      <span className="cvx-kicker-line" aria-hidden="true" />
      {children}
    </p>
  );
}
