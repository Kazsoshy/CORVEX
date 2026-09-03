export function LoadingState({ message = 'Loading...' }) {
  return (
    <section className="panel loading-state" aria-live="polite" aria-busy="true">
      <div className="loading-spinner" aria-hidden="true" />
      <p>{message}</p>
    </section>
  );
}
