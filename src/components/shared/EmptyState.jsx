export function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <section className="panel empty-state empty-state-centered">
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {actionLabel && onAction ? (
        <button className="button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
