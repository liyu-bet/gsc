export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel empty-state">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
    </section>
  );
}
