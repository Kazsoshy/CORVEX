export function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <section className="panel empty-state empty-state-centered">
      <h3>{title}</h3>
      {description ? <p className="text-ink/70">{description}</p> : null}
      {actionLabel && onAction ? (
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
